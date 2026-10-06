import type { PanelView } from "../../common/PanelView.js";
import {
  navigationNavCardTemplate,
  navigationSectionTemplate,
} from "./NavigationOperationsViewTemplate.js";
import NavigationWorkflow from "./NavigationWorkflow.js";

export class NavigationOperationsView {
  readonly panelView: PanelView;
  readonly element: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly toggleButton2: HTMLButtonElement;

  constructor(readonly navigationWorkflow: NavigationWorkflow) {
    const navCardElement = document.createElement("div");
    navCardElement.className = "panel-group";
    navCardElement.innerHTML = navigationNavCardTemplate;

    const sectionElement = document.createElement("section");
    sectionElement.className = "panel-view panel-navigation hidden";
    sectionElement.innerHTML = navigationSectionTemplate;

    this.element = sectionElement;
    this.panelView = {
      id: "navigation",
      title: "Map Navigation",
      sectionElement,
      navCardElement,
    };

    this.toggleButton = sectionElement.querySelector(
      ".toggle-navigation-layers",
    ) as HTMLButtonElement;
    this.toggleButton?.addEventListener("click", () =>
      this.navigationWorkflow.toggleNavigationLayers(),
    );

    this.toggleButton2 = sectionElement.querySelector(
      ".toggle-selection-navigation",
    ) as HTMLButtonElement;
    this.toggleButton2?.addEventListener("click", () =>
      this.navigationWorkflow.toggleSelectionNavigation(),
    );
  }
}
