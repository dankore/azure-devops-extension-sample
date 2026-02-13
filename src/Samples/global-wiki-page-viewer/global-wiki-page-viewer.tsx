import "./global-wiki-page-viewer.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { getClient } from "azure-devops-extension-api";
import { CoreRestClient, TeamProjectReference } from "azure-devops-extension-api/Core";
import { WikiRestClient } from "azure-devops-extension-api/Wiki";
import type { WikiV2, WikiPageDetail } from "azure-devops-extension-api/Wiki";
import { TextField } from "azure-devops-ui/TextField";
import { Button } from "azure-devops-ui/Button";
import { ButtonGroup } from "azure-devops-ui/ButtonGroup";
import { CommonServiceIds, IHostPageLayoutService, PanelSize } from "azure-devops-extension-api";
import { showRootComponent } from "../../Common";

interface IWikiPageItem {
    path: string;
}

interface IGlobalWikiPageViewerState {
    projects: TeamProjectReference[];
    selectedProject?: TeamProjectReference;
    wikis: WikiV2[];
    selectedWikiId?: string;
    pages: IWikiPageItem[];
    selectedPagePath?: string;
    loadingProjects: boolean;
    loadingWikis: boolean;
    loadingPages: boolean;
    statusMessage?: string;
    statusType?: "success" | "error";
}

class GlobalWikiPageViewer extends React.Component<{}, IGlobalWikiPageViewerState> implements Dashboard.IConfigurableWidget {
    constructor(props: {}) {
        super(props);
        this.state = {
            projects: [],
            wikis: [],
            pages: [],
            loadingProjects: false,
            loadingWikis: false,
            loadingPages: false
        };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("global-wiki-page-viewer-widget", this);
            this.loadProjects();
        });
    }

    public render(): JSX.Element {
        const sortedProjects = [...this.state.projects].sort((a, b) =>
            (a.name || "").localeCompare(b.name || "")
        );

        return (
            <div className="gwv-content">
                <h2 className="gwv-title">Global Wiki Page Viewer</h2>
                <p className="gwv-subtitle">
                    Select a project, wiki, and page. Open in Wiki for the native experience, or Quick view for a peek in the panel.
                </p>

                {this.state.statusMessage && (
                    <div className={`gwv-status ${this.state.statusType || "success"}`}>
                        <div className="gwv-status-content">
                            <span>{this.state.statusMessage}</span>
                        </div>
                    </div>
                )}

                <div className="gwv-field">
                    <label className="gwv-label" htmlFor="gwv-project">Project</label>
                    {this.state.loadingProjects ? (
                        <div className="gwv-loading">Loading projects...</div>
                    ) : (
                        <select
                            id="gwv-project"
                            className="gwv-select"
                            value={this.state.selectedProject?.id ?? ""}
                            aria-label="Select a project"
                            onChange={(e) => this.onProjectChange(e.target.value)}
                        >
                            <option value="">Select a project</option>
                            {sortedProjects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {this.state.selectedProject && (
                    <>
                        <div className="gwv-field">
                            <label className="gwv-label" htmlFor="gwv-wiki">Wiki</label>
                            {this.state.loadingWikis ? (
                                <div className="gwv-loading">Loading wikis...</div>
                            ) : this.state.wikis.length === 0 ? (
                                <div className="gwv-hint">No wiki found in this project.</div>
                            ) : (
                                <select
                                    id="gwv-wiki"
                                    className="gwv-select"
                                    value={this.state.selectedWikiId ?? ""}
                                    aria-label="Select a wiki"
                                    onChange={(e) => this.onWikiChange(e.target.value)}
                                >
                                    <option value="">Select a wiki</option>
                                    {this.state.wikis.map((w) => (
                                        <option key={w.id} value={w.id}>
                                            {w.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {this.state.selectedWikiId && (
                            <div className="gwv-field">
                                <label className="gwv-label" htmlFor="gwv-page">Page</label>
                                {this.state.loadingPages ? (
                                    <div className="gwv-loading">Loading pages...</div>
                                ) : this.state.pages.length === 0 ? (
                                    <div className="gwv-hint">No pages found in this wiki.</div>
                                ) : (
                                    <select
                                        id="gwv-page"
                                        className="gwv-select"
                                        value={this.state.selectedPagePath ?? ""}
                                        aria-label="Select a wiki page"
                                        onChange={(e) =>
                                            this.setState({ selectedPagePath: e.target.value || undefined })
                                        }
                                    >
                                        <option value="">Select a page</option>
                                        {this.state.pages.map((page) => (
                                            <option key={page.path} value={page.path}>
                                                {page.path.replace(/^\//, "")}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}

                        {this.state.selectedWikiId && (
                            <div className="gwv-actions">
                                <ButtonGroup>
                                    <Button
                                        text="Open in Wiki"
                                        primary
                                        disabled={!this.canView()}
                                        onClick={() => this.openInWiki()}
                                    />
                                    <Button
                                        text="Quick view"
                                        disabled={!this.canView()}
                                        onClick={() => this.viewPage()}
                                    />
                                </ButtonGroup>
                            </div>
                        )}
                    </>
                )}

            </div>
        );
    }

    private canView(): boolean {
        return !!(this.state.selectedProject && this.state.selectedWikiId && this.state.selectedPagePath);
    }

    /** Open the selected wiki page in the native Azure DevOps Wiki UI (new tab). */
    private openInWiki(): void {
        if (!this.canView()) return;
        const wiki = this.state.wikis.find((w) => w.id === this.state.selectedWikiId);
        const path = this.state.selectedPagePath!;
        if (!wiki?.remoteUrl) {
            this.setState({
                statusMessage: "Could not get wiki URL.",
                statusType: "error"
            });
            return;
        }
        const pagePath = path.startsWith("/") ? path : `/${path}`;
        const url = `${wiki.remoteUrl}?pagePath=${encodeURIComponent(pagePath)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        this.setState({ statusMessage: undefined });
    }

    private async loadProjects(): Promise<void> {
        this.setState({ loadingProjects: true, statusMessage: undefined });
        try {
            const projects = await getClient(CoreRestClient).getProjects();
            this.setState({ projects, loadingProjects: false });
        } catch (e) {
            this.setState({
                loadingProjects: false,
                statusMessage: "Failed to load projects: " + (e as Error).message,
                statusType: "error"
            });
        }
    }

    private async onProjectChange(projectId: string): Promise<void> {
        if (!projectId) {
            this.setState({
                selectedProject: undefined,
                wikis: [],
                selectedWikiId: undefined,
                pages: [],
                selectedPagePath: undefined
            });
            return;
        }
        const project = this.state.projects.find((p) => p.id === projectId);
        if (!project) return;

        this.setState({
            selectedProject: project,
            wikis: [],
            selectedWikiId: undefined,
            pages: [],
            selectedPagePath: undefined,
            statusMessage: undefined,
            loadingWikis: true
        });

        try {
            const wikis = await getClient(WikiRestClient).getAllWikis(project.name!);
            this.setState({
                wikis,
                loadingWikis: false
            });
        } catch (e) {
            this.setState({
                loadingWikis: false,
                statusMessage: "Failed to load wikis: " + (e as Error).message,
                statusType: "error"
            });
        }
    }

    private async onWikiChange(wikiId: string): Promise<void> {
        if (!wikiId) {
            this.setState({
                selectedWikiId: undefined,
                pages: [],
                selectedPagePath: undefined
            });
            return;
        }
        this.setState({
            selectedWikiId: wikiId,
            pages: [],
            selectedPagePath: undefined,
            loadingPages: true,
            statusMessage: undefined
        });

        const projectName = this.state.selectedProject?.name;
        if (!projectName) {
            this.setState({ loadingPages: false });
            return;
        }

        try {
            const client = getClient(WikiRestClient);
            // API only allows 1-100 for 'top', so use 100.
            // Omit continuationToken for the first batch (per API docs).
            const batchRequest: any = {
                top: 100,
                pageViewsForDays: 0
            };
            const result = await client.getPagesBatch(batchRequest, projectName, wikiId);
            const pages: IWikiPageItem[] = (result || []).map((detail: WikiPageDetail) => ({
                path: detail.path
            }));
            this.setState({
                pages,
                loadingPages: false
            });
        } catch (e) {
            this.setState({
                loadingPages: false,
                statusMessage: "Failed to load wiki pages: " + (e as Error).message,
                statusType: "error"
            });
        }
    }

    private async viewPage(): Promise<void> {
        if (!this.canView()) return;
        const projectName = this.state.selectedProject!.name!;
        const wikiId = this.state.selectedWikiId!;
        const path = this.state.selectedPagePath!;

        this.setState({
            statusMessage: "Loading page content...",
            statusType: undefined
        });

        try {
            const client = getClient(WikiRestClient);
            const content = await client.getPageText(projectName, wikiId, path);
            
            const dialogService = await SDK.getService<IHostPageLayoutService>(CommonServiceIds.HostPageLayoutService);
            const pageTitle = path.replace(/^\//, "");
            
            // Use panel instead of dialog: dialog width is fixed (~480px) by the host and cannot be resized; panel with Large size gives much more width
            dialogService.openPanel(
                SDK.getExtensionContext().id + ".wiki-page-viewer-dialog",
                {
                    title: pageTitle,
                    size: PanelSize.Large,
                    configuration: {
                        pageTitle: pageTitle,
                        pageContent: content
                    }
                }
            );
            
            this.setState({
                statusMessage: undefined
            });
        } catch (e) {
            const message = (e as Error).message || String(e);
            this.setState({
                statusMessage: "Failed to load page content: " + message,
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

showRootComponent(<GlobalWikiPageViewer />);

