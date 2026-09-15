/**
 * AquaTrace — Modal Manager
 * Controls all modal dialogs: incident dossier and any future modals.
 * Replaces scattered inline onclick="openModal()" / onclick="closeModal()" attributes.
 */

const _modalEl = () => document.getElementById('modal');

/**
 * Open the incident dossier modal.
 * Uses style.display instead of class toggling — Tailwind `hidden` sets
 * display:none which would override the required flex layout (known bug fix).
 */
function openModal() {
  const el = _modalEl();
  if (el) el.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/**
 * Close the active modal.
 */
function closeModal() {
  const el = _modalEl();
  if (el) el.style.display = 'none';
  document.body.style.overflow = '';
}

/**
 * Initialize global modal event listeners:
 * - Escape key closes the active modal
 * - Click on overlay backdrop closes modal
 */
function initModals() {
  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Click on overlay background (not the inner content box)
  const overlay = _modalEl();
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
}
