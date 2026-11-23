import { Breadcrumb, BreadcrumbItem } from '@carbon/react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

export function PageBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumb className="page-breadcrumb" noTrailingSlash>
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <BreadcrumbItem key={`${c.label}-${i}`} isCurrentPage={isLast}>
            {c.to && !isLast ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
          </BreadcrumbItem>
        );
      })}
    </Breadcrumb>
  );
}
