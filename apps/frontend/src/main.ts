import "ol/ol.css";
import "./style.css";
import CompositionRoot from "./common/CompositionRoot.js";

async function main(): Promise<void> {
  const compositionRoot = await CompositionRoot.create();
  if (import.meta.env.DEV) {
    Object.defineProperty(globalThis, "compositionRoot", {
      value: compositionRoot,
    });
  }
}

main().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="startup-error">${escapeHtml(error instanceof Error ? error.message : String(error))} - Application not fully loaded, please solve the problem and reload the page.</div>`,
  );
});

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;",
      })[char] ?? char,
  );
}
