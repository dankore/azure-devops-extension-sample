import "./global-work-item-search.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { TextField } from "azure-devops-ui/TextField";
import { Button } from "azure-devops-ui/Button";
import { ButtonGroup } from "azure-devops-ui/ButtonGroup";
import { CommonServiceIds, IHostPageLayoutService, PanelSize } from "azure-devops-extension-api";
import { showRootComponent } from "../../Common";

const DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 2;
const SEARCH_TOP = 25;

interface IWorkItemSearchResult {
    id: number;
    projectName: string;
    projectId: string;
    title: string;
    workItemType: string;
    state: string;
    assignedTo: string;
    url: string;
}

interface IGlobalWorkItemSearchState {
    searchQuery: string;
    results: IWorkItemSearchResult[];
    loading: boolean;
    statusMessage?: string;
    statusType?: "success" | "error";
}

class GlobalWorkItemSearch extends React.Component<{}, IGlobalWorkItemSearchState> implements Dashboard.IConfigurableWidget {
    private debounceTimer: number | undefined;
    private abortController: AbortController | undefined;

    constructor(props: {}) {
        super(props);
        this.state = {
            searchQuery: "",
            results: [],
            loading: false
        };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("global-work-item-search-widget", this);
        });
    }

    public componentWillUnmount(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        if (this.abortController) this.abortController.abort();
    }

    public render(): JSX.Element {
        const { searchQuery, results, loading } = this.state;
        const trimmed = (searchQuery || "").trim();

        return (
            <div className="gwis-content">
                <h2 className="gwis-title">Global Work Item Search</h2>
                <p className="gwis-subtitle">
                    Search work items across all projects. Click a result to preview or open in a new tab.
                </p>

                {this.state.statusMessage && (
                    <div className={`gwis-status ${this.state.statusType || "success"}`}>
                        {this.state.statusMessage}
                    </div>
                )}

                <div className="gwis-field">
                    <label className="gwis-label">Search work items</label>
                    <TextField
                        value={searchQuery}
                        onChange={(_, value) => this.onSearchChange(value || "")}
                        placeholder="Type to search (min 2 chars)..."
                    />
                </div>

                <div className="gwis-results">
                    {loading && <div className="gwis-loading">Searching...</div>}
                    {!loading && trimmed.length >= MIN_SEARCH_LENGTH && results.length === 0 && trimmed && (
                        <div className="gwis-no-results">No work items found.</div>
                    )}
                    {!loading && results.length > 0 && (
                        <ul className="gwis-list" role="list">
                            {results.map((item) => (
                                <li key={`${item.projectId}-${item.id}`} className="gwis-list-item">
                                    <div className="gwis-result-button">
                                        <div className="gwis-result-header">
                                            <span className="gwis-result-id">#{item.id}</span>
                                            <span className="gwis-result-title">{item.title}</span>
                                        </div>
                                        <div className="gwis-result-meta">
                                            {item.workItemType} · {item.state}
                                            {item.assignedTo && ` · ${item.assignedTo}`}
                                            {` · ${item.projectName}`}
                                        </div>
                                        <div className="gwis-result-actions">
                                            <Button
                                                text="Preview"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    this.openPreview(item);
                                                }}
                                            />
                                            <Button
                                                text="Open in new tab"
                                                primary
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    this.openInNewTab(item);
                                                }}
                                            />
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        );
    }

    private onSearchChange(value: string): void {
        this.setState({ searchQuery: value, statusMessage: undefined });
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        const trimmed = value.trim();
        if (trimmed.length < MIN_SEARCH_LENGTH) {
            this.setState({ results: [], loading: false });
            return;
        }
        this.debounceTimer = window.setTimeout(() => this.runSearch(trimmed), DEBOUNCE_MS);
    }

    private async runSearch(searchText: string): Promise<void> {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();
        this.setState({ loading: true, statusMessage: undefined });

        try {
            const webContext = SDK.getWebContext();
            const orgName = (webContext as any).collection?.name ?? (webContext as any).account?.name ?? "";
            if (!orgName) {
                throw new Error("Could not get organization name.");
            }
            const token = await SDK.getAccessToken();
            const url = `https://almsearch.dev.azure.com/${encodeURIComponent(orgName)}/_apis/search/workitemsearchresults?api-version=7.1`;
            const body = {
                searchText,
                $skip: 0,
                $top: SEARCH_TOP,
                filters: null,
                includeFacets: false
            };

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(body),
                signal: this.abortController.signal
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(err || `Search failed: ${res.status}`);
            }

            const data = await res.json();
            const results: IWorkItemSearchResult[] = (data.results || []).map((r: any) => {
                const fields = r.fields || {};
                const project = r.project || {};
                const id = parseInt(String(fields["System.Id"] || fields["system.id"] || 0), 10);
                return {
                    id,
                    projectName: project.name || "",
                    projectId: project.id || "",
                    title: fields["System.Title"] || fields["system.title"] || "Untitled",
                    workItemType: fields["System.WorkItemType"] || fields["system.workitemtype"] || "",
                    state: fields["System.State"] || fields["system.state"] || "",
                    assignedTo: this.extractDisplayName(fields["System.AssignedTo"] || fields["system.assignedto"]),
                    url: r.url || ""
                };
            });

            this.setState({ results, loading: false });
        } catch (e) {
            if ((e as Error).name === "AbortError") return;
            this.setState({
                results: [],
                loading: false,
                statusMessage: "Search failed: " + (e as Error).message,
                statusType: "error"
            });
        }
    }

    private extractDisplayName(identity: string | object | undefined): string {
        if (!identity) return "";
        if (typeof identity === "string") return identity;
        if (typeof identity === "object" && identity !== null && "displayName" in identity) {
            return String((identity as any).displayName);
        }
        return "";
    }

    private openInNewTab(item: IWorkItemSearchResult): void {
        const webContext = SDK.getWebContext();
        const orgName = (webContext as any).collection?.name ?? (webContext as any).account?.name ?? "";
        const url = orgName
            ? `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(item.projectName)}/_workitems/edit/${item.id}`
            : `/${encodeURIComponent(item.projectName)}/_workitems/edit/${item.id}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }

    private async openPreview(item: IWorkItemSearchResult): Promise<void> {
        try {
            const dialogService = await SDK.getService<IHostPageLayoutService>(CommonServiceIds.HostPageLayoutService);
            dialogService.openPanel(
                SDK.getExtensionContext().id + ".work-item-preview-dialog",
                {
                    title: `#${item.id} - ${item.title}`,
                    size: PanelSize.Large,
                    configuration: {
                        workItemId: item.id,
                        projectName: item.projectName,
                        title: item.title,
                        workItemType: item.workItemType,
                        state: item.state,
                        assignedTo: item.assignedTo
                    }
                }
            );
        } catch (e) {
            this.setState({
                statusMessage: "Failed to open preview: " + (e as Error).message,
                statusType: "error"
            });
        }
    }

    public async preload(_widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async load(_widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async reload(_widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        return Dashboard.WidgetStatusHelper.Success();
    }
}

showRootComponent(<GlobalWorkItemSearch />);
