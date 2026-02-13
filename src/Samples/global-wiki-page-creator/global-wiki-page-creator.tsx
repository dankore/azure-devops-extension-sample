import "./global-wiki-page-creator.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { getClient } from "azure-devops-extension-api";
import { CoreRestClient, TeamProjectReference } from "azure-devops-extension-api/Core";
import { WikiRestClient } from "azure-devops-extension-api/Wiki";
import type { WikiV2 } from "azure-devops-extension-api/Wiki";
import { WikiType } from "azure-devops-extension-api/Wiki";
import { TextField } from "azure-devops-ui/TextField";
import { Button } from "azure-devops-ui/Button";
import { showRootComponent } from "../../Common";

interface IGlobalWikiPageCreatorState {
    projects: TeamProjectReference[];
    selectedProject?: TeamProjectReference;
    wikis: WikiV2[];
    selectedWikiId?: string;
    pagePath: string;
    content: string;
    loading: boolean;
    loadingWikis: boolean;
    creatingWiki: boolean;
    statusMessage?: string;
    statusType?: "success" | "error";
    createdPageUrl?: string;
    createdPageName?: string;
}

class GlobalWikiPageCreator extends React.Component<{}, IGlobalWikiPageCreatorState> implements Dashboard.IConfigurableWidget {
    constructor(props: {}) {
        super(props);
        this.state = {
            projects: [],
            wikis: [],
            pagePath: "",
            content: "",
            loading: false,
            loadingWikis: false,
            creatingWiki: false
        };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("global-wiki-page-creator-widget", this);
            this.loadProjects();
        });
    }

    public render(): JSX.Element {
        const sortedProjects = [...this.state.projects].sort((a, b) =>
            (a.name || "").localeCompare(b.name || "")
        );

        return (
            <div className="gwic-content">
                <h2 className="title">Global Wiki Page Creator</h2>
                <p className="subtitle">
                    Create a wiki page in any project from your dashboard.
                </p>

                {this.state.statusMessage && (
                    <div className={`gwic-status ${this.state.statusType || "success"}`}>
                        <div className="gwic-status-content">
                            <span>{this.state.statusMessage}</span>
                            {this.state.statusType === "success" && this.state.createdPageUrl && this.state.createdPageName && (
                                <a
                                    href={this.state.createdPageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="gwic-page-link"
                                >
                                    Open {this.state.createdPageName}
                                </a>
                            )}
                        </div>
                    </div>
                )}

                <div className="gwic-field">
                    <label className="gwic-label" htmlFor="gwic-wiki-project">Project</label>
                    <select
                        id="gwic-wiki-project"
                        className="gwic-select"
                        value={this.state.selectedProject?.id ?? ""}
                        aria-label="Select a project"
                        onChange={(e) => {
                            const id = e.target.value;
                            if (!id) {
                                this.setState({
                                    selectedProject: undefined,
                                    wikis: [],
                                    selectedWikiId: undefined,
                                    statusMessage: undefined,
                                    createdPageUrl: undefined,
                                    createdPageName: undefined
                                });
                                return;
                            }
                            const project = this.state.projects.find((p) => p.id === id);
                            if (project) this.handleProjectSelect(project);
                        }}
                    >
                        <option value="">Select a project</option>
                        {sortedProjects.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </div>

                {this.state.selectedProject && (
                    <>
                        <div className="gwic-field">
                            <label className="gwic-label" htmlFor="gwic-wiki-wiki">Wiki</label>
                            {this.state.loadingWikis ? (
                                <div className="gwic-loading">Loading wikis...</div>
                            ) : this.state.wikis.length === 0 ? (
                                <div className="gwic-no-wiki">
                                    <div className="gwic-hint">No wiki in this project.</div>
                                    <Button
                                        text={this.state.creatingWiki ? "Creating wiki…" : "Create project wiki"}
                                        primary
                                        disabled={this.state.creatingWiki}
                                        onClick={() => this.createProjectWiki()}
                                    />
                                </div>
                            ) : (
                                <select
                                    id="gwic-wiki-wiki"
                                    className="gwic-select"
                                    value={this.state.selectedWikiId ?? ""}
                                    onChange={(e) =>
                                        this.setState({ selectedWikiId: e.target.value || undefined })
                                    }
                                    aria-label="Select a wiki"
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
                            <>
                                <div className="gwic-field">
                                    <label className="gwic-label">Page path</label>
                                    <TextField
                                        value={this.state.pagePath}
                                        onChange={(_, value) => this.setState({ pagePath: value || "" })}
                                        placeholder="e.g. MyPage or Folder/MyPage"
                                    />
                                </div>

                                <div className="gwic-field">
                                    <label className="gwic-label">Content (Markdown)</label>
                                    <textarea
                                        className="gwic-textarea"
                                        value={this.state.content}
                                        onChange={(e) => this.setState({ content: e.target.value })}
                                        placeholder="Enter wiki page content (Markdown supported)"
                                        rows={6}
                                    />
                                </div>

                                <div className="gwic-actions">
                                    <Button
                                        text="Create page"
                                        primary
                                        disabled={!this.canCreate() || this.state.loading}
                                        onClick={() => this.createPage()}
                                    />
                                    <Button
                                        text="Clear"
                                        onClick={() => this.clearForm()}
                                        disabled={this.state.loading}
                                    />
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        );
    }

    private canCreate(): boolean {
        return !!(
            this.state.selectedProject &&
            this.state.selectedWikiId &&
            this.state.pagePath.trim()
        );
    }

    private async loadProjects(): Promise<void> {
        try {
            const projects = await getClient(CoreRestClient).getProjects();
            this.setState({ projects });
        } catch (error) {
            this.setState({
                statusMessage: "Failed to load projects: " + (error as Error).message,
                statusType: "error"
            });
        }
    }

    private async handleProjectSelect(project: TeamProjectReference): Promise<void> {
        this.setState({
            selectedProject: project,
            wikis: [],
            selectedWikiId: undefined,
            statusMessage: undefined,
            createdPageUrl: undefined,
            createdPageName: undefined,
            loadingWikis: true
        });

        try {
            const wikis = await getClient(WikiRestClient).getAllWikis(project.name!);
            const defaultWiki = wikis.length === 1 ? wikis[0] : wikis.find((w) => w.name === project.name) || wikis[0];
            this.setState({
                wikis,
                selectedWikiId: defaultWiki?.id,
                loadingWikis: false
            });
        } catch (error) {
            this.setState({
                loadingWikis: false,
                statusMessage: "Failed to load wikis: " + (error as Error).message,
                statusType: "error"
            });
        }
    }

    private async createProjectWiki(): Promise<void> {
        const project = this.state.selectedProject;
        if (!project || !project.id || !project.name) return;

        this.setState({ creatingWiki: true, statusMessage: undefined, statusType: undefined });

        try {
            const client = getClient(WikiRestClient);
            // Project Wiki: only name, projectId, type. Use <ProjectName>.wiki so the backing Git repo
            // is named ProjectName.wiki and won't conflict with an existing repo named after the project.
            const wikiName = project.name + ".wiki";
            const createParams: any = {
                name: wikiName,
                projectId: project.id,
                type: WikiType.ProjectWiki
            };
            await client.createWiki(createParams, project.name);
            this.setState({
                creatingWiki: false,
                statusMessage: "Project wiki created.",
                statusType: "success"
            });
            await this.handleProjectSelect(project);
        } catch (e) {
            const message = (e as Error).message || String(e);
            const alreadyExists = /already exists|TF400948/i.test(message);
            if (alreadyExists) {
                this.setState({
                    creatingWiki: false,
                    statusMessage: "A wiki or repo with that name may already exist. Checking…",
                    statusType: "success"
                });
                await this.handleProjectSelect(project);
                return;
            }
            this.setState({
                creatingWiki: false,
                statusMessage: "Failed to create project wiki: " + message,
                statusType: "error"
            });
        }
    }

    private clearForm(): void {
        this.setState({
            pagePath: "",
            content: "",
            statusMessage: undefined,
            statusType: undefined,
            createdPageUrl: undefined,
            createdPageName: undefined
        });
    }

    private async createPage(): Promise<void> {
        if (!this.canCreate() || !this.state.selectedProject || !this.state.selectedWikiId) return;

        this.setState({ loading: true, statusMessage: undefined, statusType: undefined });

        try {
            const webContext = SDK.getWebContext();
            const orgName =
                (webContext as any).collection?.name ||
                (webContext as any).account?.name;
            const projectName = this.state.selectedProject.name!;
            const wikiId = this.state.selectedWikiId;
            let path = this.state.pagePath.trim();
            if (!path.startsWith("/")) path = "/" + path;

            const token = await SDK.getAccessToken();
            const url = `https://dev.azure.com/${encodeURIComponent(orgName!)}/${encodeURIComponent(projectName)}/_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages?path=${encodeURIComponent(path)}&api-version=7.1`;

            const res = await fetch(url, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ content: this.state.content || "" })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || `HTTP ${res.status}`);
            }

            const page = await res.json();
            const pageUrl = page.remoteUrl || (orgName
                ? `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(projectName)}/_wiki?pagePath=${encodeURIComponent(path)}`
                : "");

            this.setState({
                loading: false,
                statusMessage: "Wiki page created.",
                statusType: "success",
                createdPageUrl: pageUrl,
                createdPageName: path.replace(/^\//, ""),
                pagePath: "",
                content: ""
            });
        } catch (e) {
            const message = (e as Error).message || String(e);
            this.setState({
                loading: false,
                statusMessage: "Failed to create wiki page: " + message,
                statusType: "error"
            });
        }
    }

    public async preload(_widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async load(widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async reload(widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        return Dashboard.WidgetStatusHelper.Success();
    }
}

showRootComponent(<GlobalWikiPageCreator />);
