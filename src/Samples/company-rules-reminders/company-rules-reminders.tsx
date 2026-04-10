import "./company-rules-reminders.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { getClient } from "azure-devops-extension-api";
import { WikiRestClient, WikiV2, WikiPageDetail } from "azure-devops-extension-api/Wiki";
import { marked } from "marked";
import { showRootComponent } from "../../Common";
import { getCachedReminderIfValid, getReminderForToday, refreshTodayReminder } from "./ai-company-rules";

const FIXED_PROJECT_NAME = "Dankore Software";
const FIXED_WIKI_IDENTIFIER = "Dankore-Software.wiki";
const FIXED_WIKI_PAGE_PATH = "/Contractor-Handbook";

interface ICompanyRulesRemindersState {
    loading: boolean;
    reminderText: string;
    /** Rendered HTML from markdown/plain reminder text */
    reminderHtml: string;
    error?: string;
}

/** Decorative panel for the right column (SVG + CSS; not content). */
function WeekArtPanel(): JSX.Element {
    return (
        <div className="crr-art" aria-hidden="true">
            <div className="crr-art-bg" />
            <svg className="crr-art-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="crrArtSky" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#cde8f7" />
                        <stop offset="100%" stopColor="#e8f2fb" />
                    </linearGradient>
                    <linearGradient id="crrArtSun" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ffd78c" />
                        <stop offset="100%" stopColor="#ffb84d" />
                    </linearGradient>
                </defs>
                <rect width="200" height="200" fill="url(#crrArtSky)" rx="12" />
                <circle cx="148" cy="52" r="28" fill="url(#crrArtSun)" opacity="0.95" />
                <path
                    d="M0 120 Q50 100 100 120 T200 115 L200 200 L0 200 Z"
                    fill="#7eb8d9"
                    opacity="0.35"
                />
                <path
                    d="M0 135 Q55 125 110 140 T200 130 L200 200 L0 200 Z"
                    fill="#5a9fc4"
                    opacity="0.45"
                />
                <path
                    d="M0 155 Q60 148 120 162 T200 152 L200 200 L0 200 Z"
                    fill="#3d87b3"
                    opacity="0.5"
                />
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <circle
                        key={i}
                        cx={24 + i * 24}
                        cy={178}
                        r={3}
                        fill="#ffffff"
                        opacity={0.5 + (i % 3) * 0.12}
                    />
                ))}
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

class CompanyRulesReminders extends React.Component<{}, ICompanyRulesRemindersState> implements Dashboard.IConfigurableWidget {
    private widgetId: string | undefined;
    private fetchInFlight: boolean = false;

    constructor(props: {}) {
        super(props);
        this.state = {
            loading: true,
            reminderText: "",
            reminderHtml: ""
        };
    }

    public componentDidMount(): void {
        SDK.init().then(() => {
            SDK.register("company-rules-reminders-widget", this);
            const config = SDK.getConfiguration();
            this.widgetId = (config as any)?.widgetId || (config as any)?.id;
        });
    }

    public render(): JSX.Element {
        const today = formatDate(new Date());
        const { loading, error, reminderText, reminderHtml } = this.state;

        return (
            <div className="crr-content">
                <div className="crr-split">
                    <div className="crr-col-left">
                        <h2 className="crr-title">Company Rules Reminder</h2>
                        <div className="crr-tip-card">
                            <div className="crr-tip-meta">
                                <div className="crr-tip-day">{today}</div>
                                <button
                                    className="crr-refresh-button"
                                    type="button"
                                    onClick={() => this.loadReminder(true)}
                                    disabled={loading}
                                    aria-label="Get another reminder"
                                    title="Get another reminder"
                                >
                                    <span className="crr-refresh-icon" aria-hidden="true">⟳</span>
                                </button>
                            </div>

                            <div className="crr-tip-text crr-tip-markdown">
                                {loading && !error && <span>Loading today&apos;s company reminder...</span>}
                                {!loading && !error && reminderHtml && (
                                    <div dangerouslySetInnerHTML={{ __html: reminderHtml }} />
                                )}
                                {!loading && error && (
                                    <span>
                                        {reminderText || "Unable to load handbook reminder right now."}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="crr-col-right">
                        <WeekArtPanel />
                    </div>
                </div>
            </div>
        );
    }

    private ensureWidgetId(): void {
        if (this.widgetId) {
            return;
        }
        const config = SDK.getConfiguration();
        this.widgetId = (config as any)?.widgetId || (config as any)?.id;
    }

    private async reminderMarkdownToHtml(text: string): Promise<string> {
        try {
            const html = await Promise.resolve(marked.parse(text, { gfm: true }) as string | Promise<string>);
            return html;
        } catch {
            return this.escapeHtml(text);
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, "<br>");
    }

    private async loadReminder(refreshTodayOnly: boolean): Promise<void> {
        this.ensureWidgetId();
        const sourceKey = `${FIXED_PROJECT_NAME}:${FIXED_WIKI_IDENTIFIER}:${FIXED_WIKI_PAGE_PATH}`;

        // Fast path: weekly cache hit — no wiki API, no AI (same idea as Daily Security Tips).
        if (!refreshTodayOnly) {
            const cached = getCachedReminderIfValid(this.widgetId, sourceKey);
            if (cached) {
                const reminderHtml = await this.reminderMarkdownToHtml(cached.reminder);
                this.setState({
                    loading: false,
                    error: undefined,
                    reminderText: cached.reminder,
                    reminderHtml
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
            const handbookText = await this.resolveHandbookText(FIXED_PROJECT_NAME, FIXED_WIKI_IDENTIFIER, FIXED_WIKI_PAGE_PATH);
            const result = refreshTodayOnly
                ? await refreshTodayReminder(this.widgetId, sourceKey, handbookText)
                : await getReminderForToday(this.widgetId, sourceKey, handbookText);

            const reminderHtml = await this.reminderMarkdownToHtml(result.reminder);

            this.setState({
                loading: false,
                error: undefined,
                reminderText: result.reminder,
                reminderHtml
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to load handbook reminder.";
            this.setState({
                loading: false,
                error: message,
                reminderText: this.state.reminderText || "Could not load the handbook page. Check wiki access and try again.",
                reminderHtml: this.state.reminderHtml || ""
            });
        } finally {
            this.fetchInFlight = false;
        }
    }

    private async resolveHandbookText(projectName: string, wikiIdentifier: string, configuredPath: string): Promise<string> {
        const client = getClient(WikiRestClient);
        const wikiId = await this.resolveWikiId(client, projectName, wikiIdentifier);
        const normalizedPath = this.ensureLeadingSlash(configuredPath);

        try {
            return await client.getPageText(projectName, wikiId, normalizedPath, undefined, undefined, true);
        } catch {
            // Fallback: find matching path by scanning the first page batch.
            const batchRequest: any = {
                top: 100,
                pageViewsForDays: 0
            };

            const pages = await client.getPagesBatch(batchRequest, projectName, wikiId);
            const matchedPath = this.findBestPathMatch(normalizedPath, pages || []);
            if (!matchedPath) {
                throw new Error(`Wiki page path not found: ${normalizedPath}. Try the full page path shown in wiki navigation.`);
            }

            return await client.getPageText(projectName, wikiId, matchedPath, undefined, undefined, true);
        }
    }

    private async resolveWikiId(client: WikiRestClient, projectName: string, wikiIdentifier: string): Promise<string> {
        try {
            const wikis = await client.getAllWikis(projectName);
            const byId = wikis.find((w: WikiV2) => (w.id || "").toLowerCase() === wikiIdentifier.toLowerCase());
            if (byId?.id) {
                return byId.id;
            }
            const byName = wikis.find((w: WikiV2) => (w.name || "").toLowerCase() === wikiIdentifier.toLowerCase());
            if (byName?.id) {
                return byName.id;
            }
        } catch {
            // Ignore and fallback to the raw identifier.
        }
        return wikiIdentifier;
    }

    private ensureLeadingSlash(path: string): string {
        return path.startsWith("/") ? path : `/${path}`;
    }

    private normalizePath(path: string): string {
        return this.ensureLeadingSlash(path).toLowerCase().replace(/\s+/g, "-");
    }

    private findBestPathMatch(requestedPath: string, pages: WikiPageDetail[]): string | undefined {
        const requested = this.normalizePath(requestedPath);
        const direct = pages.find((p) => this.normalizePath(p.path) === requested);
        if (direct?.path) {
            return direct.path;
        }

        const suffix = pages.find((p) => this.normalizePath(p.path).endsWith(requested));
        return suffix?.path;
    }

    public async preload(_widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        this.loadReminder(false);
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async load(_widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        this.loadReminder(false);
        return Dashboard.WidgetStatusHelper.Success();
    }

    public async reload(_widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
        this.loadReminder(false);
        return Dashboard.WidgetStatusHelper.Success();
    }
}

showRootComponent(<CompanyRulesReminders />);
