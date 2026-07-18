import { Link } from "react-router-dom";

import { IconDesabilitar, IconEdit, IconEncerrar, IconHabilitar, IconRenovar, IconTrash } from "@/components/icons";
import { LABEL } from "@/lib/labels";

type Props = {
  editTo: string;
  renovarTo?: string;
  encerrarTo?: string;
  onHabilitar?: () => void;
  onDesabilitar?: () => void;
  togglingAtivo?: boolean;
  onDelete: () => void;
  deleting?: boolean;
  deleteLabel?: string;
  /** Contratos: encerrar → renovar → editar → excluir */
  variant?: "default" | "contrato";
};

export function RowActions({
  editTo,
  renovarTo,
  encerrarTo,
  onHabilitar,
  onDesabilitar,
  togglingAtivo,
  onDelete,
  deleting,
  deleteLabel = LABEL.excluir,
  variant = "default",
}: Props) {
  const busy = deleting || togglingAtivo;

  const editar = (
    <Link to={editTo} className="btn btn--icon" aria-label={LABEL.editar} title={LABEL.editar}>
      <IconEdit className="row-actions__icon" />
    </Link>
  );

  const habilitar = onHabilitar ? (
    <button
      type="button"
      className="btn btn--icon btn--icon-ok"
      disabled={busy}
      onClick={onHabilitar}
      aria-label={LABEL.habilitar}
      title={LABEL.habilitar}
    >
      <IconHabilitar className="row-actions__icon" />
    </button>
  ) : null;

  const desabilitar = onDesabilitar ? (
    <button
      type="button"
      className="btn btn--icon btn--icon-warn"
      disabled={busy}
      onClick={onDesabilitar}
      aria-label={LABEL.desabilitar}
      title={LABEL.desabilitar}
    >
      <IconDesabilitar className="row-actions__icon" />
    </button>
  ) : null;

  const renovar = renovarTo ? (
    <Link to={renovarTo} className="btn btn--icon" aria-label="Renovar" title="Renovar">
      <IconRenovar className="row-actions__icon" />
    </Link>
  ) : null;

  const encerrar = encerrarTo ? (
    <Link to={encerrarTo} className="btn btn--icon" aria-label="Encerrar" title="Encerrar">
      <IconEncerrar className="row-actions__icon" />
    </Link>
  ) : null;

  const excluir = (
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
  );

  const toggleAtivo = habilitar ?? desabilitar;

  const actions =
    variant === "contrato"
      ? [encerrar, renovar, editar, excluir]
      : [toggleAtivo, editar, renovar, encerrar, excluir];

  return <div className="row-actions">{actions}</div>;
}
