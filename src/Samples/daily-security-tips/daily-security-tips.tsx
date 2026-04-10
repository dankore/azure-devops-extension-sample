import "./daily-security-tips.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { marked } from "marked";
import { showRootComponent } from "../../Common";
import { getCachedTipIfValid, getTipForTodayFromOllama, refreshTodayTipPreserveWeek } from "./ai-security-tips";

interface IDailySecurityTipsSettings {
    customHeaderText?: string;
}

interface IDailySecurityTipsState {
    customHeaderText: string;
    customHeaderHtml: string;
    loading: boolean;
    error?: string;
    tipText: string;
    tipHtml: string;
}

/** Right column: security-themed SVG + CSS (decorative). */
function SecurityArtPanel(): JSX.Element {
    return (
        <div className="dst-art" aria-hidden="true">
            <div className="dst-art-bg" />
            <svg className="dst-art-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="dstArtBg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#e8f4fc" />
                        <stop offset="100%" stopColor="#d0e8f7" />
                    </linearGradient>
                    <linearGradient id="dstArtShield" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#0078d4" />
                        <stop offset="100%" stopColor="#004578" />
                    </linearGradient>
                </defs>
                <rect width="200" height="200" fill="url(#dstArtBg)" rx="12" />
                <path
                    d="M100 28 L148 52 V108 C148 142 128 168 100 180 C72 168 52 142 52 108 V52 Z"
                    fill="url(#dstArtShield)"
                    opacity="0.92"
                />
                <path
                    d="M100 52 L128 68 V102 C128 124 116 140 100 148 C84 140 72 124 72 102 V68 Z"
                    fill="rgba(255,255,255,0.25)"
                />
                <circle cx="100" cy="96" r="14" fill="none" stroke="#ffffff" strokeWidth="4" opacity="0.9" />
                <path d="M94 96 L98 100 L108 88" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
                <circle cx="44" cy="48" r="3" fill="#0078d4" opacity="0.35" />
                <circle cx="162" cy="56" r="2.5" fill="#0078d4" opacity="0.3" />
                <circle cx="156" cy="150" r="4" fill="#0078d4" opacity="0.25" />
            </svg>
        </div>
    );
}

function formatDate(d: Date): string {
    return d.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

class DailySecurityTips extends React.Component<{}, IDailySecurityTipsState> implements Dashboard.IConfigurableWidget {
    private widgetId: string | undefined;
    private fetchInFlight: boolean = false;

    constructor(props: {}) {
        super(props);
        this.state = {
            customHeaderText: "",
            customHeaderHtml: "",
            loading: true,
            error: undefined,
            tipText: "",
            tipHtml: ""
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
        const { loading, error, tipText, tipHtml } = this.state;

        return (
            <div className="dst-content">
                <div className="dst-split">
                    <div className="dst-col-left">
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
                            <div className="dst-tip-text dst-tip-markdown">
                                {loading && !error && <span>Loading today&apos;s security tip…</span>}
                                {!loading && !error && tipHtml && (
                                    <div dangerouslySetInnerHTML={{ __html: tipHtml }} />
                                )}
                                {!loading && error && (
                                    <span>
                                        {tipText || "Unable to load AI security tip right now."}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="dst-col-right">
                        <SecurityArtPanel />
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

    private ensureWidgetId(): void {
        if (this.widgetId) {
            return;
        }
        const config = SDK.getConfiguration();
        this.widgetId = (config as any)?.widgetId || (config as any)?.id;
    }

    private async tipMarkdownToHtml(text: string): Promise<string> {
        try {
            return await Promise.resolve(marked.parse(text, { gfm: true }) as string | Promise<string>);
        } catch {
            return this.escapeHtml(text);
        }
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

            this.loadTipFromOllama();
        } catch {
            this.setState({ customHeaderText: "", customHeaderHtml: "", tipText: "", tipHtml: "", loading: false, error: "Invalid widget settings." });
        }
    }

    private async loadTipFromOllama(refreshTodayOnly: boolean = false): Promise<void> {
        this.ensureWidgetId();

        if (!refreshTodayOnly) {
            const cached = getCachedTipIfValid(this.widgetId);
            if (cached) {
                const tipHtml = await this.tipMarkdownToHtml(cached.tip);
                this.setState({
                    loading: false,
                    error: undefined,
                    tipText: cached.tip,
                    tipHtml
                });
                return;
            }
        }

        if (this.fetchInFlight) {
            return;
        }

        this.fetchInFlight = true;
        this.setState({ loading: true, error: undefined });

        try {
            const result = refreshTodayOnly
                ? await refreshTodayTipPreserveWeek(this.widgetId)
                : await getTipForTodayFromOllama(this.widgetId);
            const tipHtml = await this.tipMarkdownToHtml(result.tip);
            this.setState({ tipText: result.tip, tipHtml, loading: false, error: undefined });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to load AI tip.";
            this.setState({
                loading: false,
                error: message,
                tipText: this.state.tipText || "Stay alert for phishing emails and unexpected access requests, and verify through trusted channels before acting.",
                tipHtml: this.state.tipHtml || ""
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
