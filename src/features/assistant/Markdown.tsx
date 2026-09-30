import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Jednoduché a bezpečné zobrazenie markdownu z odpovede asistenta (bez HTML). */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={blocks.length} className="leading-relaxed">
          {para.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {inline(l)}
            </Fragment>
          ))}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={blocks.length} className={list.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}>
          {list.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </Tag>,
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
    } else if (heading) {
      flushPara();
      flushList();
      blocks.push(
        <p key={blocks.length} className="font-semibold">
          {inline(heading[1])}
        </p>,
      );
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-2 text-[15px]">{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={out.length}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={out.length} className="rounded bg-surface-2 px-1 text-[13px]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(<SmartLink key={out.length} href={mm[2]} label={mm[1]} />);
    } else out.push(<SmartLink key={out.length} href={tok} label={tok.replace(/^https?:\/\//, '').slice(0, 40)} />);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function SmartLink({ href, label }: { href: string; label: string }) {
  if (href.startsWith('/')) return <Link to={href} className="font-medium text-primary underline underline-offset-2">{label}</Link>;
  if (!/^https?:\/\//.test(href)) return <>{label}</>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-primary underline underline-offset-2">
      {label}
    </a>
  );
}
