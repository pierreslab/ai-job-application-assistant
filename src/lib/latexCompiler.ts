const LATEX_COMPILER_URL = "https://latex.ytotech.com/builds/sync";

export async function compileLatexToPdf(latex: string): Promise<Blob> {
  const response = await fetch(LATEX_COMPILER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compiler: "pdflatex", resources: [{ main: true, content: latex }] }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `LaTeX compilation failed with status ${response.status}`);
  }

  return response.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadTex(latex: string, filename: string) {
  downloadBlob(new Blob([latex], { type: "text/plain;charset=utf-8" }), filename);
}
