import "./work-item-preview-dialog.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { Button } from "azure-devops-ui/Button";
import { ButtonGroup } from "azure-devops-ui/ButtonGroup";
import { showRootComponent } from "../../Common";

interface IWorkItemPreviewDialogState {
    workItemId?: number;
    projectName?: string;
    title?: string;
    workItemType?: string;
    state?: string;
    assignedTo?: string;
    ready: boolean;
}

class WorkItemPreviewDialog extends React.Component<{}, IWorkItemPreviewDialogState> {
    private config: any;

    constructor(props: {}) {
        super(props);
        this.state = { ready: false };
    }

    public componentDidMount(): void {
        SDK.init();
        SDK.ready().then(() => {
            this.config = SDK.getConfiguration();
            this.setState({
                workItemId: this.config.workItemId,
                projectName: this.config.projectName,
                title: this.config.title,
                workItemType: this.config.workItemType,
                state: this.config.state,
                assignedTo: this.config.assignedTo,
                ready: true
            });
        });
    }

    public render(): JSX.Element {
        if (!this.state.ready) {
            return <div className="wipd-content">Loading...</div>;
        }

        const { workItemId, projectName, title, workItemType, state, assignedTo } = this.state;

        return (
            <div className="wipd-content">
                <div className="wipd-body">
                    <div className="wipd-field">
                        <span className="wipd-label">Title</span>
                        <div className="wipd-value">{title || "—"}</div>
                    </div>
                    <div className="wipd-field">
                        <span className="wipd-label">Project</span>
                        <div className="wipd-value">{projectName || "—"}</div>
                    </div>
                    <div className="wipd-field">
                        <span className="wipd-label">Work Item Type</span>
                        <div className="wipd-value">{workItemType || "—"}</div>
                    </div>
                    <div className="wipd-field">
                        <span className="wipd-label">State</span>
                        <div className="wipd-value">{state || "—"}</div>
                    </div>
                    {assignedTo && (
                        <div className="wipd-field">
                            <span className="wipd-label">Assigned To</span>
                            <div className="wipd-value">{assignedTo}</div>
                        </div>
                    )}
                </div>
                <ButtonGroup className="wipd-button-bar">
                    <Button
                        text="Open in new tab"
                        primary
                        onClick={() => this.openInNewTab()}
                    />
                    <Button
                        text="Close"
                        onClick={() => this.onClose()}
                    />
                </ButtonGroup>
            </div>
        );
    }

    private openInNewTab(): void {
        const { workItemId, projectName } = this.state;
        if (!workItemId || !projectName) return;
        const webContext = SDK.getWebContext();
        const orgName = (webContext as any).collection?.name ?? (webContext as any).account?.name ?? "";
        const url = orgName
            ? `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(projectName)}/_workitems/edit/${workItemId}`
            : `/${encodeURIComponent(projectName)}/_workitems/edit/${workItemId}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }

    private onClose(): void {
        if (this.config) {
            if (this.config.panel) {
                this.config.panel.close();
            } else if (this.config.dialog) {
                this.config.dialog.close();
            }
        }
    }
}

showRootComponent(<WorkItemPreviewDialog />);
