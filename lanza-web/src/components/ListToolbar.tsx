import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  addTo: string;
  addLabel?: string;
  children?: ReactNode;
};

export function ListToolbar({ addTo, addLabel = "Adicionar", children }: Props) {
  return (
    <div className="list-toolbar despesas-toolbar">
      {children ? <div className="list-toolbar__filters">{children}</div> : null}
      <Link to={addTo} className="btn btn--primary">
        {addLabel}
      </Link>
    </div>
  );
}
