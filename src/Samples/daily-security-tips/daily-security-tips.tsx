import "./daily-security-tips.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { marked } from "marked";
import { showRootComponent } from "../../Common";
import { getTipForTodayFromOllama, refreshTodayTipPreserveWeek } from "./ai-security-tips";

interface IDailySecurityTipsSettings {
    customHeaderText?: string;
    aiModel?: string;
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
    loading: boolean;
    error?: string;
    tipText: string;
}

class DailySecurityTips extends React.Component<{}, IDailySecurityTipsState> implements Dashboard.IConfigurableWidget {
    private widgetId: string | undefined;
    private aiModel: string | undefined;
    private fetchInFlight: boolean = false;
    private lastLoadKey: string | undefined;

    constructor(props: {}) {
        super(props);
        this.state = {
            customHeaderText: "",
            customHeaderHtml: "",
            loading: true,
            error: undefined,
            tipText: ""
        };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("daily-security-tips-widget", this);
            const config = SDK.getConfiguration();
            this.widgetId = (config as any)?.widgetId || (config as any)?.id;
        });
    }

    public render(): JSX.Element {
        const today = formatDate(new Date());
        const { loading, error, tipText } = this.state;

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
                        <div className="dst-tip-meta">
                            <div className="dst-tip-day">{today}</div>
                            <button
                                className="dst-refresh-button"
                                type="button"
                                onClick={() => this.onRefreshClick()}
                                disabled={loading}
                                aria-label="Get another tip"
                                title="Get another tip"
                            >
                                <span className="dst-refresh-icon" aria-hidden="true">
                                    ⟳
                                </span>
                            </button>
                        </div>
                        <div className="dst-tip-text">
                            {loading && !error && <span>Loading today&apos;s security tip…</span>}
                            {!loading && !error && tipText && <span>{tipText}</span>}
                            {!loading && error && (
                                <span>
                                    {tipText || "Unable to load AI security tip right now."}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    private onRefreshClick(): void {
        this.loadTipFromOllama(true);
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
            this.aiModel = parsed.aiModel;
            this.setState({ customHeaderText: text });
            if (text) {
                Promise.resolve(marked.parse(text, { gfm: true }) as string | Promise<string>)
                    .then((html: string) => this.setState({ customHeaderHtml: html }))
                    .catch(() => this.setState({ customHeaderHtml: this.escapeHtml(text) }));
            } else {
                this.setState({ customHeaderHtml: "" });
            }

            this.loadTipFromOllama();
        } catch {
            this.aiModel = undefined;
            this.setState({ customHeaderText: "", customHeaderHtml: "", tipText: "", loading: false, error: "Invalid widget settings." });
        }
    }

    private async loadTipFromOllama(refreshTodayOnly: boolean = false): Promise<void> {
        const todayKey = new Date().toISOString().split("T")[0];
        const loadKey = `${todayKey}:${this.aiModel || ""}:${refreshTodayOnly ? "refresh" : "normal"}`;

        if (!refreshTodayOnly && (this.fetchInFlight || this.lastLoadKey === loadKey)) {
            return;
        }

        try {
            this.fetchInFlight = true;
            this.lastLoadKey = loadKey;
            this.setState({ loading: true, error: undefined });
            const result = refreshTodayOnly
                ? await refreshTodayTipPreserveWeek(this.widgetId, this.aiModel)
                : await getTipForTodayFromOllama(this.widgetId, this.aiModel, { bypassCache: false });
            this.setState({ tipText: result.tip, loading: false, error: undefined });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to load AI tip.";
            this.setState({
                loading: false,
                error: message,
                tipText: this.state.tipText || "Stay alert for phishing emails and unexpected access requests, and verify through trusted channels before acting."
            });
        } finally {
            this.fetchInFlight = false;
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
