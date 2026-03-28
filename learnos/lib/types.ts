export type Role = 'admin' | 'member'
export type Language = 'de' | 'en'
export type Tense = 'simple_present' | 'present_continuous' | 'simple_past' | 'present_perfect' | 'past_continuous' | 'past_perfect' | 'will_future' | 'going_to_future'

export interface Workspace { id: string; name: string; created_by: string; created_at: string }
export interface Profile { id: string; email: string; name: string; workspace_id: string; role: Role }
export interface Folder { id: string; name: string; parent_id: string | null; workspace_id: string; color: string; icon: string; created_at: string }
export interface LernText { id: string; title: string; content: string; content_improved: string | null; content_translated: string | null; language: Language; folder_id: string | null; created_by: string; questions: {q:string;a:string}[]; vocabulary: {en:string;de:string}[]; created_at: string }
export interface VocabSet { id: string; name: string; description: string; color: string; icon: string; workspace_id: string; created_by: string; created_at: string }
export interface VocabCard { id: string; set_id: string; word_de: string; word_en: string; synonyms: string[]; example_sentence: string }
export interface VocabProgress { user_id: string; card_id: string; correct: number; wrong: number; strength: number; last_seen: string }
export interface WritingSession { id: string; user_id: string; title: string; original_text: string; improved_text: string | null; feedback: {error:string;correction:string;explanation:string}[] | null; score: number | null; created_at: string }
export interface GrammarSentence { id: string; sentence: string; tense: Tense; signal_words: string[]; explanation: string; difficulty: 1|2|3; workspace_id: string }
export interface GrammarProgress { user_id: string; sentence_id: string; answered_tense: string; was_correct: boolean; answered_at: string }
