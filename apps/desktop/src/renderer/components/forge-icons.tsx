import type { LucideProps } from "lucide-react";
import {
  AlertTriangle,
  Binary,
  ChevronDown,
  ChevronRight,
  ChevronsLeftRightEllipsis,
  Clock3,
  Columns2,
  ExternalLink,
  EyeOff,
  FileDiff,
  FileX2,
  Folder,
  FolderOpen,
  Github,
  GitBranch,
  Grid2x2,
  Hammer,
  History,
  LayoutPanelTop,
  ListTodo,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Shield,
  Sparkles,
  TerminalSquare,
  Trash2,
  Workflow,
  X
} from "lucide-react";

const icons = {
  alert: AlertTriangle,
  binary: Binary,
  branch: GitBranch,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  columns: Columns2,
  diff: FileDiff,
  external: ExternalLink,
  fileLarge: FileX2,
  folder: Folder,
  folderOpen: FolderOpen,
  forge: Hammer,
  github: Github,
  grid: Grid2x2,
  history: History,
  ignore: EyeOff,
  layout: LayoutPanelTop,
  loop: ListTodo,
  more: MoreHorizontal,
  plus: Plus,
  restart: RotateCcw,
  resize: ChevronsLeftRightEllipsis,
  search: Search,
  settings: Settings2,
  shield: Shield,
  sparkles: Sparkles,
  terminal: TerminalSquare,
  time: Clock3,
  trash: Trash2,
  workflow: Workflow,
  x: X
} as const;

export type ForgeIconName = keyof typeof icons;

interface ForgeIconProps extends LucideProps {
  name: ForgeIconName;
}

export function ForgeIcon({ name, ...props }: ForgeIconProps) {
  const Icon = icons[name];

  return <Icon {...props} />;
}
