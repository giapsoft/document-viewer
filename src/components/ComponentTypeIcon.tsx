import type { ComponentType } from '../types';
import {
  AlignLeft,
  Image,
  LetterText,
  List,
  PanelTop,
  Play,
  type LucideProps,
} from 'lucide-react';

export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  header: 'Header',
  title: 'Title',
  body: 'Body',
  listItem: 'List item',
  img: 'Image',
  md: 'Markdown',
  action: 'Action',
};

export function getComponentTypeLabel(type: ComponentType): string {
  return COMPONENT_TYPE_LABELS[type];
}

interface ComponentTypeIconProps {
  type: ComponentType;
  size?: number;
  className?: string;
}

function MarkdownLogoIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M22.27 19.385H1.73A1.73 1.73 0 010 17.655V6.345a1.73 1.73 0 011.73-1.73h20.54A1.73 1.73 0 0124 6.345v11.308a1.73 1.73 0 01-1.73 1.731zM5.769 15.923v-4.5l2.308 2.885 2.307-2.885v4.5h2.308V8.078h-2.308l-2.307 2.885-2.308-2.885H3.46v7.847zM21.232 12h-2.309V8.077h-2.307V12h-2.308l3.461 4.039z"
      />
    </svg>
  );
}

const LUCIDE_ICON_PROPS = {
  strokeWidth: 2,
  absoluteStrokeWidth: true,
} satisfies Partial<LucideProps>;

export function ComponentTypeIcon({ type, size = 16, className }: ComponentTypeIconProps) {
  const lucideProps = { size, className, ...LUCIDE_ICON_PROPS };

  switch (type) {
    case 'header':
      return <PanelTop {...lucideProps} />;
    case 'title':
      return <LetterText {...lucideProps} />;
    case 'body':
      return <AlignLeft {...lucideProps} />;
    case 'listItem':
      return <List {...lucideProps} />;
    case 'img':
      return <Image {...lucideProps} />;
    case 'md':
      return <MarkdownLogoIcon size={size} className={className} />;
    case 'action':
      return <Play {...lucideProps} />;
  }
}

interface ComponentTypeBadgeProps {
  type: ComponentType;
  showLabel?: boolean;
  iconSize?: number;
  className?: string;
}

export function ComponentTypeBadge({
  type,
  showLabel = false,
  iconSize = 16,
  className = '',
}: ComponentTypeBadgeProps) {
  const label = getComponentTypeLabel(type);
  return (
    <span
      className={`component-type-badge${showLabel ? ' component-type-badge-labeled' : ' component-type-badge-icon-only'}${className ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
    >
      <ComponentTypeIcon type={type} size={iconSize} />
      {showLabel ? <span className="component-type-badge-label">{label}</span> : null}
    </span>
  );
}
