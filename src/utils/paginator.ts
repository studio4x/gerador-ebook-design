export function chunkIntoPages(html: string, mode: 'compact' | 'comfortable' | 'premium'): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const nodes = Array.from(doc.body.children);
  
  const pages: string[] = [];
  let currentPageNodes: Element[] = [];
  let currentHeightUnits = 0;
  
  // Custom height footprint units that map to visual space occupied under 297mm A4 bounds
  const limits = {
    compact: 460,       // Reduced from 550 to respect the bottom margin & footer space
    comfortable: 350,   // Reduced from 440 to avoid crowding the footer
    premium: 260        // Reduced from 330 to ensure premium editorial has ample footer safety
  };
  
  const activeLimit = limits[mode] || limits.comfortable;
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const tagName = node.tagName.toLowerCase();
    
    // Check if it's a chapter opener
    const isChapterOpener = node.classList.contains('chapter-opener');
    const isH1 = tagName === 'h1' || node.querySelector('h1') !== null;
    const isH2 = tagName === 'h2';
    const isH3 = tagName === 'h3';
    
    const nodeText = node.textContent || '';
    const nodeWords = nodeText.trim().split(/\s+/).filter(x => x.length > 0).length;
    
    const isBox = node.classList.contains('box-cuidado') || 
                  node.classList.contains('box-informativo') || 
                  node.classList.contains('box-reflexao') || 
                  node.classList.contains('frase-central');
                  
    // Calculate custom height cost based on element margins, padding, line heights, and words
    let nodeCost = nodeWords;
    
    if (isBox) {
      // Boxes have surrounding margins, inner paddings, borders and text
      nodeCost += 60; // Increased to protect bottom boundary on box content
    } else if (isH1 || isChapterOpener) {
      nodeCost += 50;
    } else if (isH2) {
      nodeCost += 30; // Increased heading height weight
    } else if (isH3) {
      nodeCost += 25;
    } else if (tagName === 'p' || tagName === 'li' || tagName === 'ul' || tagName === 'ol') {
      // Paragraphs and list items have substantial margin bottoms
      nodeCost += 14; // Increased layout margin footprint weight
    } else {
      nodeCost += 8;
    }

    let shouldBreakBefore = false;

    if (currentPageNodes.length > 0) {
      if (currentHeightUnits + nodeCost > activeLimit) {
        shouldBreakBefore = true;
      } else if ((isH1 || isChapterOpener) && (currentHeightUnits > activeLimit * 0.88)) {
        // Only force break on chapter start/H1 if the current page is already over 88% full
        shouldBreakBefore = true;
      } else if ((isH2 || isH3 || isBox) && (currentHeightUnits > activeLimit * 0.94)) {
        // Prevent orphan headings near the very bottom of the page (last 6% height)
        shouldBreakBefore = true;
      }
    }

    if (shouldBreakBefore) {
      pages.push(currentPageNodes.map(n => n.outerHTML).join('\n'));
      currentPageNodes = [];
      currentHeightUnits = 0;
    }
    
    currentPageNodes.push(node);
    currentHeightUnits += nodeCost;
  }
  
  if (currentPageNodes.length > 0) {
    pages.push(currentPageNodes.map(n => n.outerHTML).join('\n'));
  }
  
  return pages;
}

