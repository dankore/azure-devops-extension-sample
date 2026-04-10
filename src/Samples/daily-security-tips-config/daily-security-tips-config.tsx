import "./daily-security-tips-config.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { TextField } from "azure-devops-ui/TextField";
import { showRootComponent } from "../../Common";

interface IDailySecurityTipsSettings {
    customHeaderText?: string;
}

interface IDailySecurityTipsConfigState {
    customHeaderText: string;
}

class DailySecurityTipsConfig extends React.Component<{}, IDailySecurityTipsConfigState>
    implements Dashboard.IWidgetConfiguration {
    private widgetConfigurationContext?: Dashboard.IWidgetConfigurationContext;
    private settings: IDailySecurityTipsSettings = {};

    constructor(props: {}) {
        super(props);
        this.state = { customHeaderText: "" };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("daily-security-tips-config", this);
            SDK.resize(420, 220);
        });
    }

    public render(): JSX.Element {
        return (
            <div className="dstc-content">
                <div className="dstc-field">
                    <label className="dstc-label">Custom header text (optional)</label>
                    <TextField
                        multiline
                        rows={5}
                        value={this.state.customHeaderText}
                        onChange={(_, value) => {
                            this.updateSettings({ customHeaderText: value || "" });
                            this.setState({ customHeaderText: value || "" });
                        }}
                        placeholder="e.g. Security reminder for your team, or leave blank for the default title."
                    />
                    <div className="dstc-hint">
                        Shown above the daily tip. Plain text and Markdown supported. Save with the dialog Save button.
                    </div>
                </div>
            </div>
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

        try {
            const parsed = JSON.parse(widgetSettings.customSettings?.data || "{}") as IDailySecurityTipsSettings;
            this.settings = parsed;
            this.setState({
                customHeaderText: parsed.customHeaderText || ""
            });
        } catch {
            this.settings = {};
            this.setState({
                customHeaderText: ""
            });
        }
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async onSave(): Promise<Dashboard.SaveStatus> {
        return Dashboard.WidgetConfigurationSave.Valid(this.serializeSettings(this.settings));
    }
}

showRootComponent(<DailySecurityTipsConfig />);
