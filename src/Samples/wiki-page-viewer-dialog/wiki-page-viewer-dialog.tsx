import "./wiki-page-viewer-dialog.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { marked } from "marked";
import { Button } from "azure-devops-ui/Button";
import { ButtonGroup } from "azure-devops-ui/ButtonGroup";
import { showRootComponent } from "../../Common";

type ViewMode = "view" | "edit";

interface IWikiPageViewerDialogState {
    pageTitle?: string;
    pageContent?: string;
    renderedHtml?: string;
    viewMode: ViewMode;
    loading: boolean;
    ready: boolean;
}

class WikiPageViewerDialog extends React.Component<{}, IWikiPageViewerDialogState> {
    private config: any;

    constructor(props: {}) {
        super(props);
        this.state = {
            viewMode: "view",
            loading: true,
            ready: false
        };
    }

    public componentDidMount(): void {
        SDK.init();
        SDK.ready().then(() => {
            this.config = SDK.getConfiguration();
            const pageTitle = this.config.pageTitle || "Wiki Page";
            const pageContent = this.config.pageContent || "";
            this.setState({
                pageTitle,
                pageContent,
                viewMode: "view",
                loading: false,
                ready: true
            });
            // Render markdown (marked v12 can return string or Promise<string>)
            const content = pageContent || "";
            Promise.resolve(marked.parse(content, { gfm: true }) as string | Promise<string>)
                .then((html: string) => {
                    this.setState({ renderedHtml: html });
                })
                .catch(() => {
                    this.setState({ renderedHtml: content });
                });
        });
    }

    public render(): JSX.Element {
        return (
            <div className="wpvd-content">
                {this.state.loading ? (
                    <div className="wpvd-loading">Loading...</div>
                ) : (
                    <>
                        <div className="wpvd-toolbar">
                            <ButtonGroup>
                                <Button
                                    text="View"
                                    primary={this.state.viewMode === "view"}
                                    onClick={() => this.setState({ viewMode: "view" })}
                                />
                                <Button
                                    text="Edit"
                                    primary={this.state.viewMode === "edit"}
                                    onClick={() => this.setState({ viewMode: "edit" })}
                                />
                            </ButtonGroup>
                        </div>
                        <div className="wpvd-body">
                            {this.state.viewMode === "view" ? (
                                this.state.renderedHtml !== undefined ? (
                                    <div
                                        className="wpvd-page-content wpvd-rendered"
                                        dangerouslySetInnerHTML={{
                                            __html: this.state.renderedHtml
                                        }}
                                    />
                                ) : (
                                    <div className="wpvd-loading">Rendering…</div>
                                )
                            ) : (
                                <pre className="wpvd-page-content wpvd-raw">{this.state.pageContent}</pre>
                            )}
                        </div>
                        <ButtonGroup className="wpvd-button-bar">
                            <Button
                                primary={true}
                                text="Close"
                                onClick={() => {
                                    if (this.config) {
                                        if (this.config.panel) {
                                            this.config.panel.close();
                                        } else if (this.config.dialog) {
                                            this.config.dialog.close();
                                        }
                                    }
                                }}
                            />
                        </ButtonGroup>
                    </>
                )}
            </div>
        );
    }
}

showRootComponent(<WikiPageViewerDialog />);
