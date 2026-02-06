import "./project-navigator.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { getClient } from "azure-devops-extension-api";
import { CoreRestClient, TeamProjectReference } from "azure-devops-extension-api/Core";
import { TextField } from "azure-devops-ui/TextField";
import { showRootComponent } from "../../Common";

interface IProjectNavigatorState {
    projects: TeamProjectReference[];
    searchQuery: string;
    loading: boolean;
    statusMessage?: string;
    statusType?: "success" | "error";
}

class ProjectNavigatorWidget extends React.Component<{}, IProjectNavigatorState> implements Dashboard.IConfigurableWidget {
    constructor(props: {}) {
        super(props);
        this.state = {
            projects: [],
            searchQuery: "",
            loading: false
        };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("project-navigator-widget", this);
            this.loadProjects();
        });
    }

    public render(): JSX.Element {
        const query = (this.state.searchQuery || "").trim().toLowerCase();
        const filtered = query
            ? this.state.projects.filter(
                  (p) =>
                      (p.name && p.name.toLowerCase().includes(query)) ||
                      (p.description && p.description.toLowerCase().includes(query))
              )
            : [];
        const sorted = [...filtered].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        return (
            <div className="pn-content">
                <h2 className="pn-title">Project Navigator</h2>
                <p className="pn-subtitle">
                    Search for a project and open it in a new tab.
                </p>

                {this.state.statusMessage && (
                    <div className={`pn-status ${this.state.statusType || "success"}`}>
                        <div className="pn-status-content">
                            <span>{this.state.statusMessage}</span>
                        </div>
                    </div>
                )}

                <div className="pn-field">
                    <label className="pn-label">Search projects</label>
                    {this.state.loading ? (
                        <div className="pn-loading">Loading projects...</div>
                    ) : (
                        <TextField
                            value={this.state.searchQuery}
                            onChange={(_, value) => this.setState({ searchQuery: value || "" })}
                            placeholder="Type to search..."
                        />
                    )}
                </div>

                {!this.state.loading && this.state.searchQuery.trim() && (
                    <div className="pn-results">
                        {sorted.length === 0 ? (
                            <div className="pn-no-results">No projects match your search.</div>
                        ) : (
                            <ul className="pn-list" role="list">
                                {sorted.map((project) => (
                                    <li key={project.id} className="pn-list-item">
                                        <button
                                            type="button"
                                            className="pn-project-button"
                                            onClick={() => this.openProjectInNewTab(project)}
                                        >
                                            <span className="pn-project-name">{project.name}</span>
                                            {project.description && (
                                                <span className="pn-project-description">
                                                    {project.description}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        );
    }

    private async loadProjects(): Promise<void> {
        this.setState({ loading: true, statusMessage: undefined });

        try {
            const projects = await getClient(CoreRestClient).getProjects();
            this.setState({
                projects,
                loading: false
            });
        } catch (e) {
            const message = (e as Error).message || String(e);
            this.setState({
                loading: false,
                statusMessage: "Failed to load projects: " + message,
                statusType: "error"
            });
        }
    }

    private openProjectInNewTab(project: TeamProjectReference): void {
        if (!project.name) return;

        const webContext = SDK.getWebContext();
        const orgName =
            (webContext as any).collection?.name ||
            (webContext as any).account?.name ||
            "";

        // Open the project's Boards > Stories view (default team: "{Project Name} Team")
        const teamSegment = encodeURIComponent(`${project.name} Team`);
        const projectSegment = encodeURIComponent(project.name);
        const boardsPath = `_boards/board/t/${teamSegment}/Stories`;
        const projectUrl = orgName
            ? `https://dev.azure.com/${encodeURIComponent(orgName)}/${projectSegment}/${boardsPath}`
            : `/${projectSegment}/${boardsPath}`;

        window.open(projectUrl, "_blank", "noopener,noreferrer");
    }

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

showRootComponent(<ProjectNavigatorWidget />);
