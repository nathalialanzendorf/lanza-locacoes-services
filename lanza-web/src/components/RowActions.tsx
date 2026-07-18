import { Link } from "react-router-dom";

import { IconEdit, IconEncerrar, IconInativar, IconRenovar, IconTrash } from "@/components/icons";
import { LABEL } from "@/lib/labels";

type Props = {
  editTo: string;
  renovarTo?: string;
  encerrarTo?: string;
  onInativar?: () => void;
  inactivating?: boolean;
  onDelete: () => void;
  deleting?: boolean;
  deleteLabel?: string;
};

export function RowActions({
  editTo,
  renovarTo,
  encerrarTo,
  onInativar,
  inactivating,
  onDelete,
  deleting,
  deleteLabel = LABEL.excluir,
}: Props) {
  const busy = deleting || inactivating;

  return (
    <div className="row-actions">
      <Link to={editTo} className="btn btn--icon" aria-label={LABEL.editar} title={LABEL.editar}>
        <IconEdit className="row-actions__icon" />
      </Link>
      {onInativar ? (
        <button
          type="button"
          className="btn btn--icon btn--icon-warn"
          disabled={busy}
          onClick={onInativar}
          aria-label={LABEL.inativar}
          title={LABEL.inativar}
        >
          <IconInativar className="row-actions__icon" />
        </button>
      ) : null}
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
        disabled={busy}
        onClick={onDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <IconTrash className="row-actions__icon" />
      </button>
    </div>
  );
}
