export interface CommentChild {
  id: string;
  text: string;
  author: string;
  ts: number;
}

export interface Comment {
  v: 1;
  id: string;
  text: string;
  author: string;
  ts: number;
  resolved: boolean;
  children: CommentChild[];
}

export interface CommentWithPosition {
  comment: Comment;
  startMarkerFrom: number;
  startMarkerTo: number;
  endMarkerFrom: number;
  endMarkerTo: number;
  annotatedFrom: number;
  annotatedTo: number;
}

export interface ParseCommentsResult {
  comments: CommentWithPosition[];
  invalidPairs: number;
}

export interface CommentsPluginSettings {
  authorName: string;
  highlightColor: string;
  resolvedHighlightColor: string;
  showInReadingMode: boolean;
}

export const DEFAULT_SETTINGS: CommentsPluginSettings = {
  authorName: "",
  highlightColor: "#f4d470",
  resolvedHighlightColor: "#79828f",
  showInReadingMode: true
};
