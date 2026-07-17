import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { LABEL } from "@/lib/labels";

type Props = {
  addTo: string;
  addLabel?: string;
  importTo?: string;
  importLabel?: string;
  children?: ReactNode;
};

export function ListToolbar({
  addTo,
  addLabel = LABEL.adicionar,
  importTo,
  importLabel = LABEL.importar,
  children,
}: Props) {
  return (
    <div className="list-toolbar despesas-toolbar">
      {children ? <div className="list-toolbar__filters">{children}</div> : null}
      <div className="list-toolbar__actions">
        {importTo ? (
          <Link to={importTo} className="btn btn--ghost">
            {importLabel}
          </Link>
        ) : null}
        <Link to={addTo} className="btn btn--primary">
          {addLabel}
        </Link>
      </div>
    </div>
  );
}
