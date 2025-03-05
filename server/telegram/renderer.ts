import nodeHtmlToImage from "node-html-to-image";

export async function generateImage(html: string, css: string): Promise<Buffer> {
  const content = `
    <html>
      <head>
        <style>${css}</style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;

  return nodeHtmlToImage({
    html: content,
    quality: 100,
    type: "png",
    puppeteerArgs: {
      args: ["--no-sandbox"],
    },
  }) as Promise<Buffer>;
}