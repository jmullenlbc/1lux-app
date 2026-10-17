import { cn } from '@/lib/utils';
import { CARD, CARD_TITLE } from './tokens';

// The one card frame (Mike 10-16). Pass `padded` for the standard p-5 body, or
// use CardHeader / CardBody / CardFooter for a sectioned card.
export default function Card({ children, className, padded = false, ...props }) {
  return (
    <div className={cn(CARD, padded && 'p-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className, title, actions }) {
  return (
    <div className={cn('px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3', className)}>
      {title ? <h3 className={CARD_TITLE}>{title}</h3> : null}
      {children}
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

export function CardFooter({ children, className }) {
  return (
    <div className={cn('px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl', className)}>
      {children}
    </div>
  );
}
