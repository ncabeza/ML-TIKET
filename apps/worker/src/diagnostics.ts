import { DiagnosticIssue, ImportJob, JobDiagnostics } from "@shared/types";

function addIssue(
  issues: DiagnosticIssue[],
  issue: DiagnosticIssue
): DiagnosticIssue[] {
  issues.push(issue);
  return issues;
}

export function analyzePotentialIssues(job: ImportJob): JobDiagnostics {
  const issues: DiagnosticIssue[] = [];

  if (!job.structural_artifact_id) {
    addIssue(issues, {
      level: "warning",
      code: "missing-structure",
      message:
        "No hay artefacto estructural adjunto; vuelve a ejecutar la previsualización para asegurar mapeos confiables.",
      recommendation:
        "Repite la fase de previsualización antes de pedir confirmaciones al usuario.",
    });
  }

  if (!job.template_resolution?.template_version_id) {
    addIssue(issues, {
      level: "error",
      code: "template-not-confirmed",
      message: "La plantilla aún no está confirmada; la importación no puede ejecutarse.",
      recommendation:
        "Solicita confirmación explícita de plantilla y versión antes de pasar a ejecución.",
    });
  }

  if (job.template_resolution?.proposed_new_template) {
    addIssue(issues, {
      level: "warning",
      code: "new-template-proposed",
      message: "Se propuso crear una nueva plantilla; requiere revisión humana antes de ejecutar.",
      recommendation:
        "Valida que el nuevo contrato esté aprobado y asociado al proyecto antes de procesar tickets.",
    });
  }

  const missingness = job.ml_insights?.missingness_profile;
  if (missingness?.signal === "MNAR") {
    addIssue(issues, {
      level: "error",
      code: "missingness-mnar",
      message:
        "El perfil de missingness indica MNAR; las importaciones masivas deben bloquearse para evitar imputaciones inseguras.",
      recommendation: "Exige revisión manual y corrige las columnas críticas antes de continuar.",
    });
  }

  if (!job.ml_insights) {
    addIssue(issues, {
      level: "error",
      code: "ml-insights-missing",
      message: "No se almacenaron insights de ML; faltan sugerencias para columnas y plantillas.",
      recommendation:
        "Ejecuta nuevamente la previsualización o revisa los registros del worker antes de intentar la corrida.",
    });
  }

  const posDetection = job.ml_insights?.pos_detection;
  if (!posDetection) {
    addIssue(issues, {
      level: "error",
      code: "pos-missing",
      message: "No se detectó el número de POS en el Excel; la corrida debe bloquearse.",
      recommendation:
        "Pide al usuario que cargue el número de POS o mapee la columna correcta antes de crear tickets.",
    });
  } else if (posDetection.missing_required) {
    addIssue(issues, {
      level: "error",
      code: "pos-required",
      message: "El POS es obligatorio para el flujo Avant → Cibernos → Operaciones; completa el campo antes de ejecutar.",
      recommendation: posDetection.warnings.join(" ") ||
        "Asegura que el Excel incluya una columna de POS numérica y reintenta la previsualización.",
    });
  }

  const geolocation = job.ml_insights?.geolocation_validation;
  if (geolocation && !geolocation.ok) {
    addIssue(issues, {
      level: "error",
      code: "geolocation-blocked",
      message: "Faltan señales de geolocalización (dirección o POS); corrige antes de ejecutar.",
      recommendation: geolocation.issues.join(" ") ||
        "Incluye columna de dirección o coordenadas para validar la ubicación del POS.",
    });
  }

  if (missingness && missingness.signal !== "MNAR" && missingness.imputation_permitted === false) {
    addIssue(issues, {
      level: "error",
      code: "missingness-blocked",
      message:
        "El perfil de missingness no permite imputar de forma segura; detén la ejecución hasta contar con datos completos.",
      recommendation:
        missingness.blockers?.join(" ") ??
        "Repite la previsualización y corrige columnas críticas antes de reintentar la importación.",
    });
  }

  if (job.errors_ref) {
    addIssue(issues, {
      level: "warning",
      code: "previous-errors",
      message: "Existe un archivo de errores previo para este job; revisa los bloques antes de reintentar.",
      recommendation: "Descarga el Excel de errores y corrige las filas bloqueadas.",
    });
  }

  return {
    job_id: job._id,
    ready_to_run: issues.every((issue) => issue.level !== "error"),
    issues,
  };
}

