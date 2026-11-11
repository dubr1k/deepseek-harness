/** Request epochs prevent a late response from mutating another project, session or tab. */
export class ViewRequests {
  constructor() { this.generation = 0; this.active = null; }
  invalidate() { this.generation++; this.active?.controller.abort(); }
  start() { this.active?.controller.abort(); const ticket = { generation: this.generation, controller: new AbortController() }; this.active = ticket; return ticket; }
  accepts(ticket) { return this.active === ticket && this.generation === ticket.generation && !ticket.controller.signal.aborted; }
  finish(ticket) { return this.active === ticket; }
}
/** Existence is independent of an editable draft's possibly empty text. */
export const canSaveHandoff = (exists, text, nextStep) => exists && text.trim().length > 0 && nextStep.trim().length > 0;
/** Both saved-copy and saved-export read the durable record, never an unsaved preview. */
export async function loadSavedMarkdown(load, projectId, id) { return load({ action: 'export', projectId, id }); }
