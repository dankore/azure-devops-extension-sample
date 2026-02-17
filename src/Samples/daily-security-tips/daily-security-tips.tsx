import "./daily-security-tips.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { marked } from "marked";
import { SECURITY_TIPS } from "./security-tips";
import { showRootComponent } from "../../Common";

interface IDailySecurityTipsSettings {
    customHeaderText?: string;
}

/** Returns the tip index for today. Same tip all day, resets at midnight (local time). */
function getTipIndexForToday(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return dayOfYear % SECURITY_TIPS.length;
}

function formatDate(d: Date): string {
    return d.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

interface IDailySecurityTipsState {
    customHeaderText: string;
    customHeaderHtml: string;
}

class DailySecurityTips extends React.Component<{}, IDailySecurityTipsState> implements Dashboard.IConfigurableWidget {
    constructor(props: {}) {
        super(props);
        this.state = { customHeaderText: "", customHeaderHtml: "" };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("daily-security-tips-widget", this);
        });
    }

    public render(): JSX.Element {
        const tipIndex = getTipIndexForToday();
        const tip = SECURITY_TIPS[tipIndex];
        const today = formatDate(new Date());

        return (
            <div className="dst-content">
                <div className="dst-row dst-row-header">
                    {this.state.customHeaderText ? (
                        <div
                            className="dst-custom-header"
                            dangerouslySetInnerHTML={{ __html: this.state.customHeaderHtml || this.escapeHtml(this.state.customHeaderText) }}
                        />
                    ) : (
                        <h2 className="dst-title">Daily Security Tip</h2>
                    )}
                </div>
                <div className="dst-row dst-row-tip">
                    <div className="dst-tip-card">
                        <div className="dst-tip-text">{tip}</div>
                        <div className="dst-tip-day">{today}</div>
                    </div>
                </div>
            </div>
        );
    }

    private escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, "<br>");
    }

    private parseSettings(widgetSettings: Dashboard.WidgetSettings): void {
        try {
            const parsed = JSON.parse(widgetSettings.customSettings?.data || "{}") as IDailySecurityTipsSettings;
            const text = parsed.customHeaderText || "";
            this.setState({ customHeaderText: text });
            if (text) {
                Promise.resolve(marked.parse(text, { gfm: true }) as string | Promise<string>)
                    .then((html: string) => this.setState({ customHeaderHtml: html }))
                    .catch(() => this.setState({ customHeaderHtml: this.escapeHtml(text) }));
            } else {
                this.setState({ customHeaderHtml: "" });
            }
        } catch {
            this.setState({ customHeaderText: "", customHeaderHtml: "" });
        }
    }

    public async preload(widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        this.parseSettings(widgetSettings);
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async load(widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        this.parseSettings(widgetSettings);
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async reload(widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        this.parseSettings(widgetSettings);
        return Dashboard.WidgetStatusHelper.Success();
    }
}

showRootComponent(<DailySecurityTips />);
