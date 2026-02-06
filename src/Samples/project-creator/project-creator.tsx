import "./project-creator.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { getClient } from "azure-devops-extension-api";
import { CoreRestClient } from "azure-devops-extension-api/Core";
import { TextField } from "azure-devops-ui/TextField";
import { Button } from "azure-devops-ui/Button";
import { showRootComponent } from "../../Common";

interface ProcessInfo {
    id: string;
    name: string;
    type: string;
    templateTypeId?: string;
    parentProcessTypeId?: string;
}

interface IProjectCreatorState {
    name: string;
    description: string;
    visibility: "private" | "public";
    processes: ProcessInfo[];
    selectedProcessId?: string;
    loadingProcesses: boolean;
    creating: boolean;
    statusMessage?: string;
    statusType?: "success" | "error";
    createdProjectUrl?: string;
    createdProjectName?: string;
}

class ProjectCreatorWidget extends React.Component<{}, IProjectCreatorState> implements Dashboard.IConfigurableWidget {
    constructor(props: {}) {
        super(props);
        this.state = {
            name: "",
            description: "",
            visibility: "private",
            processes: [],
            selectedProcessId: undefined,
            loadingProcesses: false,
            creating: false
        };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("project-creator-widget", this);
            this.loadProcesses();
        });
    }

    public render(): JSX.Element {
        return (
            <div className="pc-content">
                <h2 className="pc-title">Project Creator</h2>
                <p className="pc-subtitle">
                    Create a new Azure DevOps project directly from your dashboard.
                </p>

                {this.state.statusMessage && (
                    <div className={`pc-status ${this.state.statusType || "success"}`}>
                        <div className="pc-status-content">
                            <span>{this.state.statusMessage}</span>
                            {this.state.statusType === "success" && this.state.createdProjectUrl && this.state.createdProjectName && (
                                <a
                                    href={this.state.createdProjectUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="pc-project-link"
                                >
                                    Open {this.state.createdProjectName}
                                </a>
                            )}
                        </div>
                    </div>
                )}

                <div className="pc-field">
                    <label className="pc-label">Project name</label>
                    <TextField
                        value={this.state.name}
                        onChange={(_, value) => this.setState({ name: value || "" })}
                        placeholder="Enter project name"
                    />
                </div>

                <div className="pc-field">
                    <label className="pc-label">Description</label>
                    <textarea
                        className="pc-textarea"
                        value={this.state.description}
                        onChange={(e) => this.setState({ description: e.target.value })}
                        placeholder="Enter project description (optional)"
                        rows={3}
                    />
                </div>

                <div className="pc-field">
                    <label className="pc-label" htmlFor="pc-visibility-select">Visibility</label>
                    <select
                        id="pc-visibility-select"
                        className="pc-select"
                        value={this.state.visibility}
                        onChange={(e) =>
                            this.setState({ visibility: (e.target.value as "private" | "public") })
                        }
                    >
                        <option value="private">Private</option>
                        <option value="public">Public</option>
                    </select>
                </div>

                <div className="pc-field">
                    <label className="pc-label" htmlFor="pc-process-select">Work item process</label>
                    {this.state.loadingProcesses ? (
                        <div className="pc-loading">Loading processes...</div>
                    ) : (
                        <select
                            id="pc-process-select"
                            className="pc-select"
                            value={this.state.selectedProcessId || ""}
                            onChange={(e) =>
                                this.setState({ selectedProcessId: e.target.value || undefined })
                            }
                        >
                            <option value="">Select a work item process</option>
                            {this.state.processes.map((process) => {
                                // Use templateTypeId if available, otherwise fall back to id
                                const valueToUse = process.templateTypeId || process.id;
                                return (
                                    <option key={process.id} value={valueToUse}>
                                        {process.name}
                                    </option>
                                );
                            })}
                        </select>
                    )}
                </div>

                <div className="pc-actions">
                    <Button
                        primary
                        text="Create project"
                        disabled={!this.canCreate() || this.state.creating}
                        onClick={() => this.createProject()}
                    />
                    <Button
                        text="Clear"
                        disabled={this.state.creating}
                        onClick={() => this.clear()}
                    />
                </div>
            </div>
        );
    }

    private canCreate(): boolean {
        return this.state.name.trim().length > 0 && !!this.state.selectedProcessId;
    }

    private clear() {
        this.setState({
            name: "",
            description: "",
            visibility: "private",
            selectedProcessId: undefined,
            creating: false,
            statusMessage: undefined,
            statusType: undefined,
            createdProjectUrl: undefined,
            createdProjectName: undefined
        });
    }

    private async createProject(): Promise<void> {
        if (!this.canCreate() || this.state.creating || !this.state.selectedProcessId) {
            return;
        }

        this.setState({ creating: true, statusMessage: undefined, statusType: undefined });

        try {
            const client = getClient(CoreRestClient);

            // Find the selected process to get its templateTypeId or id
            const selectedProcess = this.state.processes.find(
                (p) => (p.templateTypeId || p.id) === this.state.selectedProcessId
            );

            if (!selectedProcess) {
                this.setState({
                    creating: false,
                    statusMessage: "Selected process not found. Please select a process again.",
                    statusType: "error"
                });
                return;
            }

            // Use templateTypeId if available, otherwise use the process id
            // For inherited processes, the process id should be used as templateTypeId
            const templateTypeId = selectedProcess.templateTypeId || selectedProcess.id;

            const projectToCreate: any = {
                name: this.state.name.trim(),
                description: this.state.description.trim(),
                capabilities: {
                    processTemplate: {
                        templateTypeId: templateTypeId
                    },
                    versioncontrol: {
                        sourceControlType: "Git"
                    }
                },
                visibility: this.state.visibility
            };

            await client.queueCreateProject(projectToCreate);

            const projectName = this.state.name.trim();
            const webContext = SDK.getWebContext();
            const orgName =
                (webContext as any).collection?.name ||
                (webContext as any).account?.name ||
                "";
            const teamSegment = encodeURIComponent(`${projectName} Team`);
            const projectSegment = encodeURIComponent(projectName);
            const boardsPath = `_boards/board/t/${teamSegment}/Stories`;
            const createdProjectUrl = orgName
                ? `https://dev.azure.com/${encodeURIComponent(orgName)}/${projectSegment}/${boardsPath}`
                : `/${projectSegment}/${boardsPath}`;

            this.setState({
                creating: false,
                statusMessage:
                    "Project creation has been queued. It may take a minute or two to complete.",
                statusType: "success",
                createdProjectUrl,
                createdProjectName: projectName
            });
        } catch (e) {
            const message = (e as Error).message || String(e);
            this.setState({
                creating: false,
                statusMessage: "Failed to queue project creation: " + message,
                statusType: "error"
            });
        }
    }

    /**
     * Load all available work item processes from Azure DevOps
     * and populate the processes dropdown.
     */
    private async loadProcesses(): Promise<void> {
        this.setState({ loadingProcesses: true });

        try {
            const webContext = SDK.getWebContext();
            const orgName =
                (webContext as any).collection?.name ||
                (webContext as any).account?.name;

            if (!orgName) {
                this.setState({
                    loadingProcesses: false,
                    statusMessage: "Could not determine organization name.",
                    statusType: "error"
                });
                return;
            }

            const token = await SDK.getAccessToken();

            const response = await fetch(
                `https://dev.azure.com/${encodeURIComponent(
                    orgName
                )}/_apis/work/processes?$expand=all&api-version=7.0-preview.2`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            if (!response.ok) {
                this.setState({
                    loadingProcesses: false,
                    statusMessage: "Failed to load work item processes.",
                    statusType: "error"
                });
                return;
            }

            const data = await response.json();
            const rawProcesses: any[] = (data && data.value) || [];

            // Map processes and use templateTypeId if available, otherwise use id
            const processes: ProcessInfo[] = rawProcesses.map((p: any) => ({
                id: p.id || p.typeId || "",
                name: p.name || "",
                type: p.type || "",
                templateTypeId: p.templateTypeId || p.id || p.typeId,
                parentProcessTypeId: p.parentProcessTypeId
            })).filter((p: ProcessInfo) => p.id && p.name);

            // Sort processes by name for better UX
            processes.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

            this.setState({
                processes,
                loadingProcesses: false
            });
        } catch (e) {
            const message = (e as Error).message || String(e);
            this.setState({
                loadingProcesses: false,
                statusMessage: "Failed to load work item processes: " + message,
                statusType: "error"
            });
        }
    }

    // Dashboard.IConfigurableWidget implementation
    public async preload(
        _widgetSettings: Dashboard.WidgetSettings
    ): Promise<Dashboard.WidgetStatus> {
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async load(
        _widgetSettings: Dashboard.WidgetSettings
    ): Promise<Dashboard.WidgetStatus> {
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async reload(
        _widgetSettings: Dashboard.WidgetSettings
    ): Promise<Dashboard.WidgetStatus> {
        return Dashboard.WidgetStatusHelper.Success();
    }
}

showRootComponent(<ProjectCreatorWidget />);
