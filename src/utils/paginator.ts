export function chunkIntoPages(html: string, mode: 'compact' | 'comfortable' | 'premium'): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const nodes = Array.from(doc.body.children);
  
  const pages: string[] = [];
  let currentPageNodes: Element[] = [];
  let currentWords = 0;
  
  const limits = {
    compact: { text: 500, box: 350 },
    comfortable: { text: 400, box: 250 },
    premium: { text: 300, box: 150 }
  };
  
  const currentLimit = limits[mode] || limits.comfortable;
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const tagName = node.tagName.toLowerCase();
    
    // Check if it's a chapter opener
    const isChapterOpener = node.classList.contains('chapter-opener');
    
    // Check if node itself is an h1 or contains an h1 directly
    const isH1 = tagName === 'h1' || node.querySelector('h1') !== null;
    
    const nodeText = node.textContent || '';
    const nodeWords = nodeText.trim().split(/\s+/).filter(x => x.length > 0).length;
    
    const isBox = node.classList.contains('box-cuidado') || node.classList.contains('box-informativo') || node.classList.contains('box-reflexao') || node.classList.contains('frase-central');
    
    const hasBoxInCurrentPage = currentPageNodes.some(n => 
        n.classList.contains('box-cuidado') || 
        n.classList.contains('box-informativo') || 
        n.classList.contains('box-reflexao') || 
        n.classList.contains('frase-central')
    );
    
    const activeWordLimit = (isBox || hasBoxInCurrentPage) ? currentLimit.box : currentLimit.text;

    let shouldBreakBefore = false;

    if (currentPageNodes.length > 0) {
      if (isH1) {
        shouldBreakBefore = true;
      } else if (currentWords + nodeWords > activeWordLimit) {
        shouldBreakBefore = true;
      } else if ((tagName === 'h2' || tagName === 'h3' || isBox) && (currentWords + 50 > activeWordLimit)) {
        shouldBreakBefore = true;
      }
    }

    if (shouldBreakBefore) {
      pages.push(currentPageNodes.map(n => n.outerHTML).join('\n'));
      currentPageNodes = [];
      currentWords = 0;
    }
    
    currentPageNodes.push(node);
    currentWords += nodeWords;
    
    if (isChapterOpener) {
       pages.push(currentPageNodes.map(n => n.outerHTML).join('\n'));
       currentPageNodes = [];
       currentWords = 0;
    }
  }
  
  if (currentPageNodes.length > 0) {
    pages.push(currentPageNodes.map(n => n.outerHTML).join('\n'));
  }
  
  return pages;
}
