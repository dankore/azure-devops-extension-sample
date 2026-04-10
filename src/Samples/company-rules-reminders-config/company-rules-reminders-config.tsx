import "./company-rules-reminders-config.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { TextField } from "azure-devops-ui/TextField";
import { showRootComponent } from "../../Common";

interface ICompanyRulesRemindersSettings {
    customHeaderText?: string;
    projectName?: string;
    wikiIdentifier?: string;
    wikiPagePath?: string;
    aiModel?: string;
}

const SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface ICompanyRulesRemindersConfigState {
    customHeaderText: string;
    projectName: string;
    wikiIdentifier: string;
    wikiPagePath: string;
    aiModel: string;
    width: number;
    height: number;
}

class CompanyRulesRemindersConfig extends React.Component<{}, ICompanyRulesRemindersConfigState>
    implements Dashboard.IWidgetConfiguration {
    private widgetConfigurationContext?: Dashboard.IWidgetConfigurationContext;
    private settings: ICompanyRulesRemindersSettings = {};
    private widgetName: string = "";

    constructor(props: {}) {
        super(props);
        this.state = {
            customHeaderText: "",
            projectName: "",
            wikiIdentifier: "",
            wikiPagePath: "/Contractor-Handbook",
            aiModel: "",
            width: 2,
            height: 2
        };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("company-rules-reminders-config", this);
            SDK.resize(500, 520);
        });
    }

    public render(): JSX.Element {
        return (
            <div className="crrc-content">
                <div className="crrc-field">
                    <label className="crrc-label">Width (columns)</label>
                    <select
                        className="crrc-select"
                        value={this.state.width}
                        onChange={(e) => this.onSizeChange("width", parseInt(e.target.value, 10))}
                        aria-label="Widget width"
                    >
                        {SIZE_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>

                <div className="crrc-field">
                    <label className="crrc-label">Height (rows)</label>
                    <select
                        className="crrc-select"
                        value={this.state.height}
                        onChange={(e) => this.onSizeChange("height", parseInt(e.target.value, 10))}
                        aria-label="Widget height"
                    >
                        {SIZE_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>

                <div className="crrc-field">
                    <label className="crrc-label">Custom header text (optional)</label>
                    <TextField
                        multiline
                        rows={3}
                        value={this.state.customHeaderText}
                        onChange={(_, value) => {
                            this.updateSettings({ customHeaderText: value || "" });
                            this.setState({ customHeaderText: value || "" });
                        }}
                        placeholder="e.g. Team rules and reminders"
                    />
                </div>

                <div className="crrc-field">
                    <label className="crrc-label">Project name (optional)</label>
                    <TextField
                        value={this.state.projectName}
                        onChange={(_, value) => {
                            this.updateSettings({ projectName: value || "" });
                            this.setState({ projectName: value || "" });
                        }}
                        placeholder="Defaults to current project context"
                    />
                </div>

                <div className="crrc-field">
                    <label className="crrc-label">Wiki identifier (required)</label>
                    <TextField
                        value={this.state.wikiIdentifier}
                        onChange={(_, value) => {
                            this.updateSettings({ wikiIdentifier: value || "" });
                            this.setState({ wikiIdentifier: value || "" });
                        }}
                        placeholder="Wiki id or wiki name"
                    />
                    <div className="crrc-hint">
                        This can be the wiki GUID or the wiki name shown in Azure DevOps.
                    </div>
                </div>

                <div className="crrc-field">
                    <label className="crrc-label">Wiki page path</label>
                    <TextField
                        value={this.state.wikiPagePath}
                        onChange={(_, value) => {
                            this.updateSettings({ wikiPagePath: value || "/Contractor-Handbook" });
                            this.setState({ wikiPagePath: value || "/Contractor-Handbook" });
                        }}
                        placeholder="/Contractor-Handbook"
                    />
                    <div className="crrc-hint">
                        Tip: use the exact wiki page path (not the numeric page id in the URL).
                    </div>
                </div>

                <div className="crrc-field">
                    <label className="crrc-label">AI model name (optional)</label>
                    <TextField
                        value={this.state.aiModel}
                        onChange={(_, value) => {
                            this.updateSettings({ aiModel: value || "" });
                            this.setState({ aiModel: value || "" });
                        }}
                        placeholder="e.g. llama3.2:latest"
                    />
                </div>
            </div>
        );
    }

    private onSizeChange(dim: "width" | "height", value: number): void {
        const width = dim === "width" ? value : this.state.width;
        const height = dim === "height" ? value : this.state.height;
        this.setState({ width, height });
        this.widgetConfigurationContext?.notify(
            Dashboard.ConfigurationEvent.GeneralSettingsChanged,
            Dashboard.ConfigurationEvent.Args({
                name: this.widgetName,
                size: { rowSpan: height, columnSpan: width }
            })
        );
    }

    private updateSettings(partial: Partial<ICompanyRulesRemindersSettings>): void {
        this.settings = { ...this.settings, ...partial };
        const customSettings = this.serializeSettings(this.settings);
        this.widgetConfigurationContext?.notify(
            Dashboard.ConfigurationEvent.ConfigurationChange,
            Dashboard.ConfigurationEvent.Args(customSettings)
        );
    }

    private serializeSettings(s: ICompanyRulesRemindersSettings): Dashboard.CustomSettings {
        return {
            data: JSON.stringify(s),
            version: { major: 1, minor: 0, patch: 0 }
        };
    }

    public async load(
        widgetSettings: Dashboard.WidgetSettings,
        widgetConfigurationContext: Dashboard.IWidgetConfigurationContext
    ): Promise<Dashboard.WidgetStatus> {
        this.widgetConfigurationContext = widgetConfigurationContext;
        this.widgetName = widgetSettings.name || "";

        const size = widgetSettings.size;
        const width = size?.columnSpan ?? 2;
        const height = size?.rowSpan ?? 2;

        try {
            const parsed = JSON.parse(widgetSettings.customSettings?.data || "{}") as ICompanyRulesRemindersSettings;
            this.settings = parsed;
            this.setState({
                customHeaderText: parsed.customHeaderText || "",
                projectName: parsed.projectName || "",
                wikiIdentifier: parsed.wikiIdentifier || "",
                wikiPagePath: parsed.wikiPagePath || "/Contractor-Handbook",
                aiModel: parsed.aiModel || "",
                width: Math.min(10, Math.max(1, width)),
                height: Math.min(10, Math.max(1, height))
            });
        } catch {
            this.settings = {};
            this.setState({
                customHeaderText: "",
                projectName: "",
                wikiIdentifier: "",
                wikiPagePath: "/Contractor-Handbook",
                aiModel: "",
                width: Math.min(10, Math.max(1, width)),
                height: Math.min(10, Math.max(1, height))
            });
        }

        return Dashboard.WidgetStatusHelper.Success();
    }

    public async onSave(): Promise<Dashboard.SaveStatus> {
        return Dashboard.WidgetConfigurationSave.Valid(this.serializeSettings(this.settings));
    }
}

showRootComponent(<CompanyRulesRemindersConfig />);
