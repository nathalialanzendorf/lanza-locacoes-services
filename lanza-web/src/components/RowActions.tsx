import { Link } from "react-router-dom";

import { IconEdit, IconEncerrar, IconRenovar, IconTrash } from "@/components/icons";
import { LABEL } from "@/lib/labels";

type Props = {
  editTo: string;
  renovarTo?: string;
  encerrarTo?: string;
  onDelete: () => void;
  deleting?: boolean;
  deleteLabel?: string;
};

export function RowActions({
  editTo,
  renovarTo,
  encerrarTo,
  onDelete,
  deleting,
  deleteLabel = LABEL.excluir,
}: Props) {
  return (
    <div className="row-actions">
      <Link to={editTo} className="btn btn--icon" aria-label={LABEL.editar} title={LABEL.editar}>
        <IconEdit className="row-actions__icon" />
      </Link>
      {renovarTo ? (
        <Link to={renovarTo} className="btn btn--icon" aria-label="Renovar" title="Renovar">
          <IconRenovar className="row-actions__icon" />
        </Link>
      ) : null}
      {encerrarTo ? (
        <Link to={encerrarTo} className="btn btn--icon" aria-label="Encerrar" title="Encerrar">
          <IconEncerrar className="row-actions__icon" />
        </Link>
      ) : null}
      <button
        type="button"
        className="btn btn--icon btn--icon-danger"
        disabled={deleting}
        onClick={onDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <IconTrash className="row-actions__icon" />
      </button>
    </div>
  );
}
