import { Link } from "react-router-dom";

import { IconEdit, IconEncerrar, IconRecebimento, IconRenovar, IconTrash } from "@/components/icons";
import { Toggle } from "@/components/Toggle";
import { LABEL } from "@/lib/labels";

type Props = {
  editTo: string;
  /** Baixa manual — mesma ação do dashboard (Recebimentos). */
  recebimentoTo?: string | null;
  renovarTo?: string;
  encerrarTo?: string;
  ativo?: boolean;
  onAtivoChange?: (ativo: boolean) => void;
  togglingAtivo?: boolean;
  onDelete: () => void;
  deleting?: boolean;
  deleteLabel?: string;
  /** Contratos: encerrar → renovar → editar → excluir */
  variant?: "default" | "contrato";
  /** Veículos: rótulo «Inativar» em vez de «Desabilitar». */
  toggleAtivoMode?: "desabilitar" | "inativar";
};

export function RowActions({
  editTo,
  recebimentoTo,
  renovarTo,
  encerrarTo,
  ativo = true,
  onAtivoChange,
  togglingAtivo,
  onDelete,
  deleting,
  deleteLabel = LABEL.excluir,
  variant = "default",
  toggleAtivoMode = "desabilitar",
}: Props) {
  const busy = deleting || togglingAtivo;

  const recebimento = recebimentoTo ? (
    <Link
      to={recebimentoTo}
      className="btn btn--icon btn--icon-ok"
      aria-label={LABEL.lancarRecebimento}
      title={LABEL.lancarRecebimento}
    >
      <IconRecebimento className="row-actions__icon" />
    </Link>
  ) : null;

  const editar = (
    <Link to={editTo} className="btn btn--icon" aria-label={LABEL.editar} title={LABEL.editar}>
      <IconEdit className="row-actions__icon" />
    </Link>
  );

  const toggleAtivoLabel =
    toggleAtivoMode === "inativar"
      ? ativo
        ? LABEL.inativar
        : LABEL.habilitar
      : ativo
        ? LABEL.desabilitar
        : LABEL.habilitar;

  const toggleAtivo = onAtivoChange ? (
    <Toggle
      checked={ativo}
      onChange={onAtivoChange}
      disabled={busy}
      size="compact"
      aria-label={toggleAtivoLabel}
    />
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

  const actions =
    variant === "contrato"
      ? [encerrar, renovar, editar, excluir]
      : [recebimento, toggleAtivo, editar, renovar, encerrar, excluir];

  return <div className="row-actions">{actions}</div>;
}
