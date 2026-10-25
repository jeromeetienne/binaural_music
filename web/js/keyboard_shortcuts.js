'use strict';

// ---- Keyboard shortcuts ------------------------------------------------
// One list of shortcuts feeds both the key handler and the help window, so the two never disagree.

/**
 * @typedef {object} Shortcut
 * @property {string} key Value of `KeyboardEvent.key`, in lower case.
 * @property {string} label Text shown on the key in the help window.
 * @property {string} description Text shown next to the key in the help window.
 * @property {'toggle' | 'play' | 'pause' | 'help' | 'close'} action Name of the action that the key runs.
 */

/**
 * @typedef {object} PlaybackActions
 * @property {() => unknown} toggle Starts the sound when it is paused, and pauses the sound when it plays.
 * @property {() => unknown} play Starts the sound. Does nothing when the sound already plays.
 * @property {() => unknown} pause Pauses the sound. Does nothing when the sound is already paused.
 */

/** Keyboard shortcuts for playback, and the modal window that lists them. */
class KeyboardShortcuts {
	/** Every keyboard shortcut of the page, in the order shown in the help window. */
	static SHORTCUTS = /** @type {Shortcut[]} */ ([
		{
			key: ' ',
			label: 'Space',
			description: 'Toggle between play and pause',
			action: 'toggle',
		},
		{
			key: 'p',
			label: 'P',
			description: 'Play',
			action: 'play',
		},
		{
			key: 's',
			label: 'S',
			description: 'Pause',
			action: 'pause',
		},
		{
			key: '?',
			label: '?',
			description: 'Show this list of keyboard shortcuts',
			action: 'help',
		},
		{
			key: 'escape',
			label: 'Esc',
			description: 'Close this list',
			action: 'close',
		},
	]);

	/** Types of `input` element that do not accept typed text, so the shortcuts stay active on them. */
	static NON_TEXT_INPUT_TYPES = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset'];

	/** @type {PlaybackActions | null} */
	static _playbackActions = null;

	/** @type {HTMLDialogElement | null} */
	static _dialog = null;

	/**
	 * Fills the help window, and starts to listen to the keyboard.
	 * @param {PlaybackActions} playbackActions The functions that the playback shortcuts run.
	 */
	static install(playbackActions) {
		const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('shortcuts'));
		const closeButton = /** @type {HTMLElement} */ (document.getElementById('shortcutsClose'));
		const helpButton = /** @type {HTMLElement} */ (document.getElementById('shortcutHelp'));
		KeyboardShortcuts._playbackActions = playbackActions;
		KeyboardShortcuts._dialog = dialog;
		KeyboardShortcuts._renderList();

		document.addEventListener('keydown', (event) => KeyboardShortcuts._onKeydown(event));
		document.addEventListener('keyup', (event) => KeyboardShortcuts._onKeyup(event));
		helpButton.addEventListener('click', () => dialog.showModal());
		closeButton.addEventListener('click', () => dialog.close());
		dialog.addEventListener('click', (event) => {
			if (event.target === dialog) {
				dialog.close();
			}
		});
	}

	/** Writes one line per shortcut in the help window. */
	static _renderList() {
		const listElement = /** @type {HTMLElement} */ (document.getElementById('shortcutsList'));
		const listHtmlContent = /* html */`
			${KeyboardShortcuts.SHORTCUTS.map((shortcut) => /* html */`
				<dt><kbd>${shortcut.label}</kbd></dt>
				<dd>${shortcut.description}</dd>
			`).join('')}
		`;
		listElement.innerHTML = listHtmlContent;
	}

	/**
	 * Tells whether the element accepts typed text, so a key press is meant for the element and not for the page.
	 * @param {EventTarget | null} target The element that has the focus.
	 * @returns {boolean} True when the element accepts typed text.
	 */
	static _isTextTarget(target) {
		if (target instanceof HTMLElement === false) {
			return false;
		}
		const element = /** @type {HTMLElement} */ (target);
		if (element.isContentEditable === true) {
			return true;
		}
		if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
			return true;
		}
		if (element instanceof HTMLInputElement) {
			return KeyboardShortcuts.NON_TEXT_INPUT_TYPES.includes(element.type) === false;
		}
		return false;
	}

	/**
	 * Finds the shortcut that a key press runs.
	 * @param {KeyboardEvent} event The key press.
	 * @returns {Shortcut | null} The shortcut, or null when the key press runs nothing.
	 */
	static _findShortcut(event) {
		if (event.ctrlKey === true || event.altKey === true || event.metaKey === true) {
			return null;
		}
		if (KeyboardShortcuts._isTextTarget(event.target) === true) {
			return null;
		}
		const isDialogOpen = KeyboardShortcuts._dialog !== null && KeyboardShortcuts._dialog.open === true;
		const key = event.key.toLowerCase();
		const shortcut = KeyboardShortcuts.SHORTCUTS.find((candidate) => candidate.key === key);
		if (shortcut === undefined) {
			return null;
		}
		const isCloseShortcut = shortcut.action === 'close';
		return isCloseShortcut === isDialogOpen ? shortcut : null;
	}

	/**
	 * Runs the shortcut of a key press, if there is one.
	 * @param {KeyboardEvent} event The key press.
	 */
	static _onKeydown(event) {
		const shortcut = KeyboardShortcuts._findShortcut(event);
		if (shortcut === null) {
			return;
		}
		event.preventDefault();
		if (event.repeat === true) {
			return;
		}
		const playbackActions = /** @type {PlaybackActions} */ (KeyboardShortcuts._playbackActions);
		const dialog = /** @type {HTMLDialogElement} */ (KeyboardShortcuts._dialog);
		if (shortcut.action === 'help') {
			dialog.showModal();
		} else if (shortcut.action === 'close') {
			dialog.close();
		} else {
			playbackActions[shortcut.action]();
		}
	}

	/**
	 * Stops the Space key from pressing a focused button when the key is released.
	 * @param {KeyboardEvent} event The key release.
	 */
	static _onKeyup(event) {
		const shortcut = KeyboardShortcuts._findShortcut(event);
		if (shortcut !== null && shortcut.key === ' ') {
			event.preventDefault();
		}
	}
}
