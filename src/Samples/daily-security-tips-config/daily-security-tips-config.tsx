import "./daily-security-tips-config.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { TextField } from "azure-devops-ui/TextField";
import { showRootComponent } from "../../Common";

interface IDailySecurityTipsSettings {
    customHeaderText?: string;
}

const SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface IDailySecurityTipsConfigState {
    customHeaderText: string;
    width: number;
    height: number;
}

class DailySecurityTipsConfig extends React.Component<{}, IDailySecurityTipsConfigState>
    implements Dashboard.IWidgetConfiguration {
    private widgetConfigurationContext?: Dashboard.IWidgetConfigurationContext;
    private settings: IDailySecurityTipsSettings = {};
    private widgetName: string = "";

    constructor(props: {}) {
        super(props);
        this.state = { customHeaderText: "", width: 2, height: 2 };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("daily-security-tips-config", this);
            SDK.resize(450, 320);
        });
    }

    public render(): JSX.Element {
        return (
            <div className="dstc-content">
                <div className="dstc-field">
                    <label className="dstc-label">Width (columns)</label>
                    <select
                        className="dstc-select"
                        value={this.state.width}
                        onChange={(e) => this.onSizeChange("width", parseInt(e.target.value, 10))}
                        aria-label="Widget width"
                    >
                        {SIZE_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>
                <div className="dstc-field">
                    <label className="dstc-label">Height (rows)</label>
                    <select
                        className="dstc-select"
                        value={this.state.height}
                        onChange={(e) => this.onSizeChange("height", parseInt(e.target.value, 10))}
                        aria-label="Widget height"
                    >
                        {SIZE_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>
                <div className="dstc-field">
                    <label className="dstc-label">Custom header text (top row)</label>
                    <TextField
                        multiline
                        rows={4}
                        value={this.state.customHeaderText}
                        onChange={(_, value) => {
                            this.updateSettings({ customHeaderText: value || "" });
                            this.setState({ customHeaderText: value || "" });
                        }}
                        placeholder="e.g. Security reminder for [Your Team Name], or leave blank."
                    />
                    <div className="dstc-hint">
                        Shown in the top row above the daily tip. Supports plain text and Markdown. Saved when you click Save.
                    </div>
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

    private updateSettings(partial: Partial<IDailySecurityTipsSettings>): void {
        this.settings = { ...this.settings, ...partial };
        const customSettings = this.serializeSettings(this.settings);
        this.widgetConfigurationContext?.notify(
            Dashboard.ConfigurationEvent.ConfigurationChange,
            Dashboard.ConfigurationEvent.Args(customSettings)
        );
    }

    private serializeSettings(s: IDailySecurityTipsSettings): Dashboard.CustomSettings {
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
            const parsed = JSON.parse(widgetSettings.customSettings?.data || "{}") as IDailySecurityTipsSettings;
            this.settings = parsed;
            this.setState({
                customHeaderText: parsed.customHeaderText || "",
                width: Math.min(10, Math.max(1, width)),
                height: Math.min(10, Math.max(1, height))
            });
        } catch {
            this.settings = {};
            this.setState({
                customHeaderText: "",
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

showRootComponent(<DailySecurityTipsConfig />);
