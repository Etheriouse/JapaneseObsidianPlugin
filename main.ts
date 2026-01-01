// Imports Obsidian (API plugin, éditeur, markdown, etc.)
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Wanakana → conversion romaji → kana
import { toKana, isRomaji, toHiragana, toKatakana } from 'wanakana';

// CodeMirror → live preview custom
import { Decoration, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";

// =======================
// Définition des balises
// =======================

// Hiragana
const openbalisehg = "{hg}"
const endbalisehg = "{/hg}"

// Katakana
const openbalisekk = "{kk}"
const endbalisekk = "{/kk}"

// Kana auto (hiragana / katakana)
const openbalisehk = "{hk}"
const endbalisehk = "{/hk}"

export default class MyPlugin extends Plugin {

	// Flag interne (pas encore utilisé mais utile si plus tard)
	private isFromPlugin: boolean = false;

	async onload() {

		// =======================
		// Injection du CSS japonais
		// =======================

		// Style injecté dynamiquement (évite les conflits de thème)
		const style = document.createElement("style");
		style.id = "japanese-render-style";
		style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100..900&display=swap');

.japanese-render {
	font-family: "Noto Sans JP", sans-serif !important;
	font-optical-sizing: auto !important;
	font-weight: 10px !important;
	font-style: normal !important;
}
`;
		document.head.appendChild(style);

		// =======================
		// Icône dans la sidebar
		// =======================

		const ribbonIconEl = this.addRibbonIcon(
			'dice',
			'Sample Plugin',
			(_evt: MouseEvent) => {
				// Click sur l’icône → simple notification
				new Notice('This is a notice!');
			}
		);

		// Classe custom (styling éventuel)
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// =======================
		// Status bar (desktop only)
		// =======================

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// =======================
		// Commande : Hiragana
		// =======================

		this.addCommand({
			id: 'insert-hiragana-balise',
			name: `Insert Hiragana balise (${openbalisehg} ${endbalisehg})`,
			checkCallback: (check: boolean) => {
				// On récupère la vue markdown active
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) return false;

				const editor = view.editor;

				// Exécution réelle (pas juste check)
				if (!check) {
					const cursorPos = editor.getCursor();

					// Insertion des balises
					editor.replaceRange(`${openbalisehg}${endbalisehg}`, cursorPos);

					// Curseur placé entre les balises
					editor.setCursor({
						line: cursorPos.line,
						ch: cursorPos.ch + openbalisehg.length,
					});
				}
				return true;
			},
			hotkeys: [
				{ modifiers: ["Ctrl", "Shift"], key: "H" }
			]
		});

		// =======================
		// Commande : Katakana
		// =======================

		this.addCommand({
			id: 'insert-katakana-balise',
			name: `Insert Katakana balise (${openbalisekk} ${endbalisekk})`,
			checkCallback: (check: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) return false;

				const editor = view.editor;

				if (!check) {
					const cursorPos = editor.getCursor();
					editor.replaceRange(`${openbalisekk}${endbalisekk}`, cursorPos);

					editor.setCursor({
						line: cursorPos.line,
						ch: cursorPos.ch + openbalisekk.length,
					});
				}
				return true;
			},
			hotkeys: [
				{ modifiers: ["Ctrl", "Shift"], key: "K" }
			]
		});

		// =======================
		// Commande : Kana auto
		// =======================

		this.addCommand({
			id: 'insert-kana-balise',
			name: `Insert Kana balise (${openbalisehk} ${endbalisehk})`,
			checkCallback: (check: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) return false;

				const editor = view.editor;

				if (!check) {
					const cursorPos = editor.getCursor();
					editor.replaceRange(`${openbalisehk}${endbalisehk}`, cursorPos);

					editor.setCursor({
						line: cursorPos.line,
						ch: cursorPos.ch + openbalisehk.length,
					});
				}
				return true;
			},
			hotkeys: [
				{ modifiers: ["Ctrl", "Alt"], key: "K" }
			]
		});

		// =======================
		// Rendu markdown (preview)
		// =======================

		this.registerMarkdownPostProcessor(postProcess => {

			// Mapping balise → fonction de conversion
			const displayMap: Record<string, (text: string) => string> = {
				hg: toHiragana,
				kk: toKatakana,
				hk: toKana
			};

			// Liste des balises supportées
			const tags = ["hg", "kk", "hk"];

			// Regex dynamiques par balise
			const regexes = tags.map(tag => ({
				tag,
				regex: new RegExp(`\\{${tag}\\}([\\s\\S]*?)\\{\\/${tag}\\}`, "g")
			}));

			// Parcours uniquement des nodes texte
			const walker = document.createTreeWalker(postProcess, NodeFilter.SHOW_TEXT);

			let node;
			while ((node = walker.nextNode())) {
				const original = node.nodeValue;
				if (!original) continue;

				// Remplacement balise → kana
				for (const { tag, regex } of regexes) {
					if (regex.test(original)) {
						node.nodeValue = original.replace(regex, (_, content) => {
							return displayMap[tag](content);
						});
					}
				}
			}
		});

		// =======================
		// Live preview (CodeMirror)
		// =======================

		function LivePreviewProcess() {

			const displayMap: Record<string, (text: string) => string> = {
				hg: toHiragana,
				kk: toKatakana,
				hk: toKana
			};

			const tags = ["hg", "kk", "hk"];
			const regexes = tags.map(tag => ({
				tag,
				regex: new RegExp(`\\{${tag}\\}([\\s\\S]*?)\\{\\/${tag}\\}`, "g")
			}));

			return ViewPlugin.fromClass(
				class {
					decorations: any;

					constructor(view: EditorView) {
						this.decorations = this.process(view);
					}

					update(update: ViewUpdate) {
						this.decorations = this.process(update.view);
					}

					process(view: EditorView) {
						const widgets = [];
						const text = view.state.doc.toString();
						const cursorPos = view.state.selection.main.head;

						const matches: { start: number; end: number; display: string }[] = [];

						// Recherche de toutes les balises
						for (const { tag, regex } of regexes) {
							let match;
							while ((match = regex.exec(text)) !== null) {
								const start = match.index;
								const end = start + match[0].length;

								// Si le curseur est dedans → on affiche le brut
								if (cursorPos >= start && cursorPos <= end) continue;

								matches.push({
									start,
									end,
									display: displayMap[tag](match[1])
								});
							}
						}

						// Tri pour éviter les overlaps
						matches.sort((a, b) => a.start - b.start);

						// Remplacement par widget
						for (const m of matches) {
							const deco = Decoration.replace({
								widget: new LivePreviwWidget(m.display),
								block: false
							}).range(m.start, m.end);

							widgets.push(deco);
						}

						return Decoration.set(widgets);
					}
				},
				{ decorations: v => v.decorations }
			);
		}

		// =======================
		// Widget de rendu kana
		// =======================

		class LivePreviwWidget extends WidgetType {
			content: string;

			constructor(content: string) {
				super();
				this.content = content;
			}

			toDOM() {
				const span = document.createElement("span");
				span.textContent = this.content;
				span.classList.add("japanese-render");
				return span;
			}
		}

		// Activation du live preview
		this.registerEditorExtension(LivePreviewProcess());
	}

	onunload() {
		// Cleanup si besoin plus tard
	}
}
