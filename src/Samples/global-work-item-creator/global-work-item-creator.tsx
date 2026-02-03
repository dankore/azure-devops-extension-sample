import "./global-work-item-creator.scss";
import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import { getClient } from "azure-devops-extension-api";
import { CoreRestClient, TeamProjectReference } from "azure-devops-extension-api/Core";
import { GraphRestClient } from "azure-devops-extension-api/Graph";
import { WorkItemTrackingRestClient, WorkItemType, WorkItem } from "azure-devops-extension-api/WorkItemTracking";
import { TextField } from "azure-devops-ui/TextField";
import { Button } from "azure-devops-ui/Button";
import { Icon } from "azure-devops-ui/Icon";
import { showRootComponent } from "../../Common";

interface IGlobalWorkItemCreatorState {
  projects: TeamProjectReference[];
  selectedProject?: TeamProjectReference;
  workItemTypes: WorkItemType[];
  selectedWorkItemType?: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedToSuggestions: Array<{ displayName: string; descriptor: string }>;
  assignedToDropdownOpen: boolean;
  assignedToSearching: boolean;
  loading: boolean;
  statusMessage?: string;
  statusType?: "success" | "error";
  createdWorkItem?: { id: number; url: string };
  widgetSettings?: Dashboard.WidgetSettings;
}

class GlobalWorkItemCreator extends React.Component<{}, IGlobalWorkItemCreatorState> implements Dashboard.IConfigurableWidget {
  private _assignToWrapRef: HTMLDivElement | undefined;
  private _assignToDebounceTimer: number | undefined;
  private _assignToClickOutside = (e: MouseEvent) => {
    if (this._assignToWrapRef && !this._assignToWrapRef.contains(e.target as Node)) {
      this.setState({ assignedToDropdownOpen: false });
    }
  };

  constructor(props: {}) {
    super(props);
    this.state = {
      projects: [],
      workItemTypes: [],
      title: "",
      description: "",
      assignedTo: "",
      assignedToSuggestions: [],
      assignedToDropdownOpen: false,
      assignedToSearching: false,
      loading: false
    };
  }

  componentDidMount() {
    SDK.init().then(() => {
      SDK.register("global-work-item-creator-widget", this);
      this.loadProjects();
      this.setupKeyboardShortcuts();
      document.addEventListener("click", this._assignToClickOutside);
    });
  }

  componentWillUnmount() {
    this.removeKeyboardShortcuts();
    document.removeEventListener("click", this._assignToClickOutside);
    if (this._assignToDebounceTimer) clearTimeout(this._assignToDebounceTimer);
  }

  private setupKeyboardShortcuts() {
    document.addEventListener("keydown", this.handleKeyDown);
  }

  private removeKeyboardShortcuts() {
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      if (target.tagName === "TEXTAREA" && e.key === "Enter" && !e.shiftKey) {
        return;
      }
      if (e.key === "Enter" && this.canCreate() && !this.state.loading) {
        e.preventDefault();
        this.createWorkItem();
        return;
      }
      return;
    }

    if (e.key === "Enter" && this.canCreate() && !this.state.loading) {
      e.preventDefault();
      this.createWorkItem();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      this.clearForm();
      return;
    }
  }

  private loadWidgetSettings(widgetSettings: Dashboard.WidgetSettings) {
    // Reserved for future widget configuration
  }

  render(): JSX.Element {
    const allowedTypes = ["User Story", "Task", "Contact Log Entry"];
    const availableTypes = this.state.workItemTypes
      .filter(t => allowedTypes.some(allowed => allowed.toLowerCase() === t.name.toLowerCase()))
      .map(t => {
        const canonicalName = allowedTypes.find(allowed => allowed.toLowerCase() === t.name.toLowerCase()) || t.name;
        return { ...t, canonicalName };
      });

    const sortedProjects = [...this.state.projects].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    return (
      <div className="gwic-content">
        <h2 className="title">Global Work Item Creator</h2>
        <p className="subtitle">
          Create a work item across your projects.
        </p>
        
        {this.state.statusMessage && (
          <div className={`gwic-status ${this.state.statusType || "success"}`}>
            <div className="gwic-status-content">
              {this.state.statusType === "success" && this.state.createdWorkItem ? (
                <span>
                  Work item{" "}
                  <a href={this.state.createdWorkItem.url} target="_blank" rel="noopener noreferrer" className="gwic-work-item-link">
                    #{this.state.createdWorkItem.id}
                  </a>{" "}
                  created.
                </span>
              ) : (
                <span>{this.state.statusMessage}</span>
              )}
            </div>
          </div>
        )}

        <div className="gwic-field">
          <label className="gwic-label">Project</label>
          <select
            className="gwic-select"
            value={this.state.selectedProject?.id ?? ""}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) {
                this.setState({ selectedProject: undefined, workItemTypes: [], selectedWorkItemType: undefined });
                return;
              }
              const project = this.state.projects.find(p => p.id === id);
              if (project) this.handleProjectSelect(project);
            }}
            aria-label="Select a project"
          >
            <option value="">Select a project</option>
            {sortedProjects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {this.state.selectedProject && (
          <>
            <div className="gwic-field">
              <label className="gwic-label">Work Item Type</label>
              <select
                className="gwic-select"
                value={this.state.selectedWorkItemType ?? ""}
                onChange={(e) => this.setState({ selectedWorkItemType: e.target.value || undefined })}
                aria-label="Select work item type"
              >
                <option value="">Select work item type</option>
                {availableTypes.map((type) => (
                  <option key={type.name} value={type.name}>
                    {type.canonicalName}
                  </option>
                ))}
              </select>
            </div>

            <div className="gwic-field">
              <label className="gwic-label">Title</label>
              <TextField
                value={this.state.title}
                onChange={(e, newValue) => this.setState({ title: newValue || "" })}
                placeholder="Enter work item title"
              />
            </div>

            <div className="gwic-field">
              <label className="gwic-label">Description</label>
              <textarea
                className="gwic-textarea"
                value={this.state.description}
                onChange={(e) => this.setState({ description: e.target.value })}
                placeholder="Enter work item description (optional)"
                rows={4}
              />
            </div>

            <div className="gwic-field gwic-assign-to-wrap" ref={(el) => { this._assignToWrapRef = el || undefined; }}>
              <label className="gwic-label">Assign To</label>
              <div className="gwic-assign-to-input-wrap">
                <TextField
                  value={this.state.assignedTo}
                  onChange={(e, newValue) => this.onAssignedToChange(newValue || "")}
                  onFocus={() => { this.setState({ assignedToDropdownOpen: true }); this.searchAssignedToUsers(this.state.assignedTo); }}
                  placeholder="Type to search users (optional)"
                />
                {this.state.assignedToSearching && <span className="gwic-assign-to-spinner" aria-hidden="true">...</span>}
                {this.state.assignedToDropdownOpen && (
                  <div className="gwic-assign-to-dropdown">
                    {this.state.assignedToSuggestions.length === 0 && !this.state.assignedToSearching ? (
                      <div className="gwic-assign-to-hint">Type at least one character to search users</div>
                    ) : (
                      this.state.assignedToSuggestions.map((u) => (
                        <div
                          key={u.descriptor}
                          className="gwic-assign-to-option"
                          onClick={() => this.selectAssignedToUser(u.displayName)}
                        >
                          {u.displayName}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="gwic-actions">
              <Button
                text="Create"
                primary
                disabled={!this.canCreate() || this.state.loading}
                onClick={() => this.createWorkItem()}
              />
              <Button
                text="Clear"
                onClick={() => this.clearForm()}
                disabled={this.state.loading}
              />
            </div>
          </>
        )}

      </div>
    );
  }

  private canCreate(): boolean {
    return !!(
      this.state.selectedProject &&
      this.state.selectedWorkItemType &&
      this.state.title.trim()
    );
  }

  private async loadProjects() {
    try {
      const projects = await getClient(CoreRestClient).getProjects();
      this.setState({ projects });
    } catch (error) {
      this.setState({
        statusMessage: "Failed to load projects: " + (error as Error).message,
        statusType: "error"
      });
    }
  }

  private async handleProjectSelect(project: TeamProjectReference) {
    this.setState({ 
      selectedProject: project,
      workItemTypes: [],
      selectedWorkItemType: undefined,
      statusMessage: undefined,
      createdWorkItem: undefined
    });

    await this.loadWorkItemTypes(project.name!);
  }

  private async loadWorkItemTypes(projectName: string) {
    try {
      const client = getClient(WorkItemTrackingRestClient);
      const allTypes = await client.getWorkItemTypes(projectName);
      
      const allowedTypes = ["User Story", "Task", "Contact Log Entry"];
      const types = allTypes.filter(t => 
        allowedTypes.some(allowed => allowed.toLowerCase() === t.name.toLowerCase())
      );
      
      this.setState({ workItemTypes: types });
    } catch (error) {
      this.setState({
        statusMessage: "Failed to load work item types: " + (error as Error).message,
        statusType: "error"
      });
    }
  }

  private onAssignedToChange(value: string) {
    this.setState({ assignedTo: value, assignedToDropdownOpen: true });
    if (this._assignToDebounceTimer) clearTimeout(this._assignToDebounceTimer);
    this._assignToDebounceTimer = window.setTimeout(() => this.searchAssignedToUsers(value), 300);
  }

  private async searchAssignedToUsers(query: string) {
    if (!query.trim()) {
      this.setState({ assignedToSuggestions: [], assignedToSearching: false });
      return;
    }
    this.setState({ assignedToSearching: true });
    try {
      const client = getClient(GraphRestClient);
      const subjects = await client.querySubjects({
        query: query.trim(),
        subjectKind: ["User"],
        scopeDescriptor: ""
      });
      this.setState({
        assignedToSuggestions: subjects.map((s) => ({ displayName: s.displayName || "", descriptor: s.descriptor })),
        assignedToSearching: false
      });
    } catch (e) {
      this.setState({ assignedToSuggestions: [], assignedToSearching: false });
    }
  }

  private selectAssignedToUser(displayName: string) {
    this.setState({ assignedTo: displayName, assignedToDropdownOpen: false, assignedToSuggestions: [] });
  }

  private clearForm() {
    this.setState({
      selectedProject: undefined,
      selectedWorkItemType: undefined,
      title: "",
      description: "",
      assignedTo: "",
      assignedToSuggestions: [],
      assignedToDropdownOpen: false,
      statusMessage: undefined,
      createdWorkItem: undefined
    });
  }

  private async createWorkItem() {
    if (!this.canCreate() || !this.state.selectedProject) return;

    this.setState({ loading: true, statusMessage: undefined });

    try {
      const client = getClient(WorkItemTrackingRestClient);
      const projectName = this.state.selectedProject.name!;
      const workItemType = this.state.selectedWorkItemType!;
      
      const patchDocument: any[] = [
        { op: "add", path: "/fields/System.Title", value: this.state.title.trim() }
      ];

      if (this.state.description.trim()) {
        patchDocument.push({
          op: "add",
          path: "/fields/System.Description",
          value: this.state.description.trim()
        });
      }

      if (this.state.assignedTo.trim()) {
        patchDocument.push({
          op: "add",
          path: "/fields/System.AssignedTo",
          value: this.state.assignedTo.trim()
        });
      }

      const workItem = await client.createWorkItem(
        patchDocument,
        projectName,
        workItemType
      );

      const webContext = SDK.getWebContext();
      const orgName = (webContext as any).collection?.name || (webContext as any).account?.name || "";
      const workItemUrl = orgName 
        ? `https://dev.azure.com/${orgName}/${projectName}/_workitems/edit/${workItem.id}`
        : `/${projectName}/_workitems/edit/${workItem.id}`;

      this.setState({
        statusMessage: `Work item #${workItem.id} created in ${projectName}.`,
        statusType: "success",
        title: "",
        description: "",
        assignedTo: "",
        assignedToSuggestions: [],
        assignedToDropdownOpen: false,
        selectedWorkItemType: undefined,
        loading: false,
        createdWorkItem: { id: workItem.id!, url: workItemUrl }
      });
    } catch (error) {
      this.setState({
        statusMessage: "Failed to create work item: " + (error as Error).message,
        statusType: "error",
        loading: false
      });
    }
  }

  async preload(_widgetSettings: Dashboard.WidgetSettings) {
    return Dashboard.WidgetStatusHelper.Success();
  }

  async load(widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
    try {
      this.loadWidgetSettings(widgetSettings);
      this.setState({ widgetSettings });
      return Dashboard.WidgetStatusHelper.Success();
    } catch (e) {
      return Dashboard.WidgetStatusHelper.Failure((e as any).toString());
    }
  }

  async reload(widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
    try {
      this.loadWidgetSettings(widgetSettings);
      this.setState({ widgetSettings });
      return Dashboard.WidgetStatusHelper.Success();
    } catch (e) {
      return Dashboard.WidgetStatusHelper.Failure((e as any).toString());
    }
  }
}

showRootComponent(<GlobalWorkItemCreator />);
