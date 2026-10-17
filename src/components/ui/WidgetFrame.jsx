import { cn } from '@/lib/utils';
import { CARD, CARD_TITLE, HELPER } from './tokens';

// The one widget frame (Mike 10-16): title row with an actions slot, then the
// body. Pair with WidgetEmpty and WidgetLoading so every dashboard card says
// "nothing here" and "loading" the same way.
export default function WidgetFrame({ title, sub, actions, children, className, bodyClassName, flush = false }) {
  return (
    <section className={cn(CARD, 'flex flex-col', className)}>
      {(title || actions) && (
        <header className="px-5 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h3 className={CARD_TITLE}>{title}</h3> : null}
            {sub ? <p className={cn(HELPER, 'mt-0.5')}>{sub}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
        </header>
      )}
      <div className={cn(flush ? '' : 'p-5', 'flex-1 min-h-0', bodyClassName)}>{children}</div>
    </section>
  );
}

export function WidgetEmpty({ children = 'Nothing here yet.', className }) {
  return <p className={cn('text-sm text-slate-500 text-center py-6', className)}>{children}</p>;
}

export function WidgetLoading({ children = 'Loading...', className }) {
  return <p className={cn('text-sm text-slate-500 text-center py-6', className)}>{children}</p>;
}

export function WidgetError({ children = 'Could not load.', className }) {
  return <p className={cn('text-sm text-red-600 text-center py-6', className)}>{children}</p>;
}
