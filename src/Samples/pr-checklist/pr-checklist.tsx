import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";

import "./pr-checklist.scss";

import { Header } from "azure-devops-ui/Header";
import { Page } from "azure-devops-ui/Page";
import { showRootComponent } from "../../Common";
import {
    CommonServiceIds,
    IProjectPageService,
    getClient,
} from "azure-devops-extension-api";
import { GitRestClient } from "azure-devops-extension-api/Git";
import * as Git from "azure-devops-extension-api/Git/Git";
import * as WebApi from "azure-devops-extension-api/WebApi/WebApi";

function getPrContext(): { repositoryId?: string; pullRequestId?: number } {
    try {
        const config = SDK.getConfiguration() as any;
        if (config?.pullRequestId != null && config?.repositoryId != null) {
            return {
                pullRequestId: Number(config.pullRequestId),
                repositoryId: String(config.repositoryId),
            };
        }
        if (
            config?.pageContext?.pullRequestId != null &&
            config?.pageContext?.repositoryId != null
        ) {
            return {
                pullRequestId: Number(config.pageContext.pullRequestId),
                repositoryId: String(config.pageContext.repositoryId),
            };
        }
        const href =
            (typeof window !== "undefined" && window.parent?.location?.href) ||
            (typeof window !== "undefined" && window.location?.href) ||
            "";
        const prMatch = href.match(/pullrequest\/(\d+)/i);
        const repoMatch = href.match(/\/_git\/([^/?#]+)/);
        if (prMatch && repoMatch) {
            return {
                pullRequestId: parseInt(prMatch[1], 10),
                repositoryId: repoMatch[1],
            };
        }
    } catch (_) {
        // ignore
    }
    return {};
}

interface IPrChecklistState {
    pr?: Git.GitPullRequest;
    changedFiles: string[];
    workItemRefs: WebApi.ResourceRef[];
    loading: boolean;
    error?: string;
}

class PrChecklistTab extends React.Component<{}, IPrChecklistState> {
    constructor(props: {}) {
        super(props);
        this.state = {
            changedFiles: [],
            workItemRefs: [],
            loading: true,
        };
    }

    public componentDidMount() {
        SDK.init().then(() => {
            SDK.ready().then(() => this.load());
        });
    }

    private async load() {
        const { repositoryId, pullRequestId } = getPrContext();
        if (!repositoryId || !pullRequestId) {
            this.setState({
                loading: false,
                error:
                    "Open this tab from a Pull Request details page to see the checklist.",
            });
            SDK.notifyLoadSucceeded();
            return;
        }

        try {
            const projectService = await SDK.getService<IProjectPageService>(
                CommonServiceIds.ProjectPageService
            );
            const project = await projectService.getProject();
            const projectName = project?.name;

            const gitClient = getClient(GitRestClient);
            const pr = await gitClient.getPullRequest(
                repositoryId,
                pullRequestId,
                projectName,
                undefined,
                undefined,
                undefined,
                true,
                true
            );

            const iterations = await gitClient.getPullRequestIterations(
                repositoryId,
                pullRequestId,
                projectName
            );
            const latest = iterations?.[iterations.length - 1];
            let changedFiles: string[] = [];
            if (latest?.id != null) {
                const changes = await gitClient.getPullRequestIterationChanges(
                    repositoryId,
                    pullRequestId,
                    latest.id,
                    projectName
                );
                changedFiles =
                    (changes?.changeEntries
                        ?.map((c) => c.item?.path)
                        .filter(Boolean) as string[]) || [];
            }

            const workItemRefs =
                (await gitClient.getPullRequestWorkItemRefs(
                    repositoryId,
                    pullRequestId,
                    projectName
                )) || [];

            this.setState({
                pr,
                changedFiles,
                workItemRefs,
                loading: false,
                error: undefined,
            });
            SDK.notifyLoadSucceeded();
        } catch (err) {
            this.setState({
                loading: false,
                error: (err as Error)?.message || String(err),
            });
            SDK.notifyLoadSucceeded();
        }
    }

    public render(): JSX.Element {
        const { pr, changedFiles, workItemRefs, loading, error } = this.state;

        if (loading) return <Page><Header title="Checklist" /><div className="page-content">Loading…</div></Page>;
        if (error) return <Page><Header title="Checklist" /><div className="page-content pr-checklist"><div className="check-fail">{error}</div></div></Page>;
        if (!pr) return <Page><Header title="Checklist" /><div className="page-content" /></Page>;

        const hasDescription = !!(pr.description && pr.description.trim().length > 0);
        const commitCount = pr.commits?.length ?? 0;
        const hasWorkItems = workItemRefs.length > 0;

        return (
            <Page className="pr-checklist flex-grow">
                <Header title="Checklist" />
                <div className="page-content">
                    <div className="check-item">
                        <span className={hasDescription ? "check-pass" : "check-fail"}>
                            {hasDescription ? "✓" : "✗"}
                        </span>
                        <span>Has description</span>
                    </div>
                    <div className="check-item">
                        <span className={hasWorkItems ? "check-pass" : "check-fail"}>
                            {hasWorkItems ? "✓" : "✗"}
                        </span>
                        <span>Linked work items ({workItemRefs.length})</span>
                    </div>
                    <div className="check-item">
                        <span className="check-pass">✓</span>
                        <span>Commits: {commitCount}</span>
                    </div>
                    <div className="check-item">
                        <span className="check-pass">✓</span>
                        <span>Files changed: {changedFiles.length}</span>
                    </div>

                    {workItemRefs.length > 0 && (
                        <>
                            <div className="section-title">Linked work items</div>
                            <ul className="work-item-list">
                                {workItemRefs.map((ref) => (
                                    <li key={ref.id}>
                                        <a href={ref.url} target="_blank" rel="noopener noreferrer">
                                            #{ref.id}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    {changedFiles.length > 0 && (
                        <>
                            <div className="section-title">Changed files</div>
                            <ul className="file-list">
                                {changedFiles.slice(0, 100).map((path) => (
                                    <li key={path}>{path}</li>
                                ))}
                                {changedFiles.length > 100 && (
                                    <li>… and {changedFiles.length - 100} more</li>
                                )}
                            </ul>
                        </>
                    )}
                </div>
            </Page>
        );
    }
}

showRootComponent(<PrChecklistTab />);
