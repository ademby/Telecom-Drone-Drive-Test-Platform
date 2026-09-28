import { panelShellTemplate } from "./OperationsPanelTemplate.js";
import type { PanelView } from "./PanelView.js";

/** The only view this panel builds itself; every other view (including the
 *  mission flow's missions/editor/review) is workflow-owned and arrives via
 *  {@link OperationsPanel.registerView}. */
type BuiltinPanelView = "home";

export default class OperationsPanel {
  readonly element: HTMLElement;
  private readonly homeElement: HTMLElement;
  private readonly panelBody: HTMLElement;
  private readonly panelGroups: HTMLElement;
  private readonly viewTitle: HTMLElement;
  private readonly registeredViews = new Map<string, PanelView>();

  constructor() {
    this.element = document.createElement("aside");
    this.element.className = "operations-panel mission-panel";
    this.element.innerHTML = panelShellTemplate;

    document.body.appendChild(this.element);
    this.panelBody = this.element.querySelector(".panel-body") as HTMLElement;
    this.panelGroups = this.element.querySelector(
      ".panel-groups",
    ) as HTMLElement;
    this.viewTitle = this.element.querySelector(".panel-title") as HTMLElement;
    this.homeElement = this.element.querySelector(".panel-home") as HTMLElement;

    this.element
      .querySelector(".panel-reopen")
      ?.addEventListener("click", () =>
        this.element.classList.remove("retracted"),
      );
    this.element
      .querySelector(".collapse-panel")
      ?.addEventListener("click", () =>
        this.element.classList.add("retracted"),
      );
    this.element
      .querySelector(".close-panel")
      ?.addEventListener("click", () => this.hidePanel());
  }

  /**
   * Inserts a workflow-owned {@link PanelView}: appends its section to
   * `.panel-body`, appends its optional nav card to the home screen's
   * `.panel-groups` and wires it to `showView`, and — unless the view opts
   * out via `autoWireBackButton: false` because it already wires its own
   * `.back-button` to workflow-specific cleanup — wires any `.back-button`
   * inside the section to return to `'home'`. Safe to call once per view id.
   */
  registerView(view: PanelView): void {
    if (this.registeredViews.has(view.id)) return;
    this.registeredViews.set(view.id, view);
    this.panelBody.appendChild(view.sectionElement);
    if (view.navCardElement) {
      this.panelGroups.appendChild(view.navCardElement);
      view.navCardElement
        .querySelector(".panel-nav-card")
        ?.addEventListener("click", () => this.showView(view.id));
    }
    if (view.autoWireBackButton !== false) {
      view.sectionElement
        .querySelectorAll(".back-button")
        .forEach((button) =>
          button.addEventListener("click", () => this.showHome()),
        );
    }
  }

  showPanel(): void {
    this.element.classList.remove("hidden", "retracted");
  }

  hidePanel(): void {
    this.element.classList.add("hidden");
  }

  showView(id: string): void {
    const builtinTitles: Record<BuiltinPanelView, string> = {
      home: "Operations",
    };
    this.homeElement.classList.toggle("hidden", id !== "home");
    for (const registered of this.registeredViews.values()) {
      registered.sectionElement.classList.toggle(
        "hidden",
        registered.id !== id,
      );
    }
    this.viewTitle.textContent =
      (builtinTitles as Record<string, string>)[id] ??
      this.registeredViews.get(id)?.title ??
      id;
  }

  showHome(): void {
    this.showView("home");
  }
}

export { OperationsPanel };
