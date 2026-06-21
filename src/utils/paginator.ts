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
    premium: 250        // Slightly reduced to ensure premium editorial has ample footer safety
  };
  
  const activeLimit = limits[mode] || limits.comfortable;
  
  const flushPage = () => {
    // Check for orphan headings at the end of the page
    // A heading needs at least 2 non-heading elements after it on the same page.
    const orphanNodes: Element[] = [];
    let popCount = 0;
    let nonHeadingCount = 0;

    for (let j = currentPageNodes.length - 1; j >= 0; j--) {
      const lastNode = currentPageNodes[j];
      const lastTagName = lastNode.tagName.toLowerCase();
      const isHeading = ['h1', 'h2', 'h3', 'h4', 'h5'].includes(lastTagName) || lastNode.classList.contains('chapter-opener');
      
      if (isHeading) {
        if (nonHeadingCount < 2) {
          popCount = currentPageNodes.length - j;
        } else {
          break;
        }
      } else {
        if (lastTagName === 'ul' || lastTagName === 'ol') {
          nonHeadingCount += lastNode.querySelectorAll('li').length;
        } else if (lastTagName === 'div' && (lastNode.classList.contains('box-cuidado') || lastNode.classList.contains('box-informativo') || lastNode.classList.contains('box-reflexao'))) {
          nonHeadingCount += lastNode.querySelectorAll('p, li').length;
        } else {
          nonHeadingCount++;
        }
        
        if (nonHeadingCount >= 2 && popCount === 0) {
          break;
        }
      }
    }

    if (popCount > 0 && popCount < currentPageNodes.length) {
      const popped = currentPageNodes.splice(currentPageNodes.length - popCount, popCount);
      orphanNodes.push(...popped);
    }

    if (currentPageNodes.length > 0) {
        pages.push(currentPageNodes.map(n => n.outerHTML).join('\n'));
    }
    
    currentPageNodes = [...orphanNodes];
    
    // Recalculate height for the orphans we carried over
    currentHeightUnits = orphanNodes.reduce((acc, n) => {
        const t = n.tagName.toLowerCase();
        const isChap = n.classList.contains('chapter-opener');
        const isBx = n.classList.contains('box-cuidado') || n.classList.contains('box-informativo') || n.classList.contains('box-reflexao');
        const textWords = (n.textContent || '').trim().split(/\s+/).filter(x => x.length > 0).length;
        let cost = textWords;
        if (isBx) cost += 60;
        else if (isChap) cost = 9999;
        else if (t === 'h1' || n.querySelector('h1')) cost += 50;
        else if (t === 'h2') cost += 30;
        else if (t === 'h3') cost += 25;
        else if (t === 'p' || t === 'li' || t === 'ul' || t === 'ol') cost += 14;
        else cost += 8;
        return acc + cost;
    }, 0);
  };

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
                  node.classList.contains('box-reflexao');
    const isList = tagName === 'ul' || tagName === 'ol';
                  
    // Calculate custom height cost based on element margins, padding, line heights, and words
    let nodeCost = nodeWords;
    
    if (isBox) {
      // Boxes have surrounding margins, inner paddings, borders and text
      nodeCost += 60; // Increased to protect bottom boundary on box content
    } else if (isChapterOpener) {
      nodeCost = 9999; // Occupies a full page exclusively
    } else if (isH1) {
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

    // Dynamic split algorithm for massive indivisible elements (Boxes and Lists) to prevent bottom clippings
    if ((isBox || isList) && (currentHeightUnits + nodeCost > activeLimit)) {
      const spaceLeft = activeLimit - currentHeightUnits;
      
      // If the remaining space is small, or the page is already quite full,
      // push the entire container to the next page to give it maximum width/height budget
      if (currentPageNodes.length > 0 && spaceLeft < activeLimit * 0.4) {
        flushPage();
        i--; // Re-process same node on the clean page
        continue;
      }
      
      // Attempt to split container's children if we are on a fresh page OR have substantial space
      const children = Array.from(node.children);
      if (children.length > 1) {
        const parentLimit = currentPageNodes.length === 0 ? activeLimit : spaceLeft;
        
        let accumulatedCost = isBox ? 40 : 10; // base visual wrapper overhead
        let splitIndex = 0;
        
        for (let c = 0; c < children.length; c++) {
          const child = children[c];
          const childText = child.textContent || '';
          const childWords = childText.trim().split(/\s+/).filter(x => x.length > 0).length;
          const childCost = childWords + 12; // cost per paragraph / list-item
          
          if (accumulatedCost + childCost > parentLimit && c > 0) {
            splitIndex = c;
            break;
          }
          accumulatedCost += childCost;
        }
        
        // Prevent simple orphan headings inside boxes from splitting alone at bottom of page
        let minSplit = 1;
        if (children[0].tagName.toLowerCase().match(/^h\d/)) {
          minSplit = 2; // Keep heading with at least the first item
        }
        
        if (splitIndex >= minSplit) {
          // Perform split
          const part1 = node.cloneNode(false) as HTMLElement;
          const part2 = node.cloneNode(false) as HTMLElement;
          
          for (let c = 0; c < children.length; c++) {
            if (c < splitIndex) {
              part1.appendChild(children[c].cloneNode(true));
            } else {
              part2.appendChild(children[c].cloneNode(true));
            }
          }
          
          // If split is an ordered list, set proper start offset on part 2
          if (tagName === 'ol') {
            const currentStart = Number(node.getAttribute('start') || '1');
            part2.setAttribute('start', String(currentStart + splitIndex));
          }
          
          currentPageNodes.push(part1);
          currentHeightUnits += accumulatedCost;
          
          // Replace current node in our iteration array with part2 and rewind pointer
          // so part2 is evaluated on the next iteration (starting a fresh page!)
          nodes[i] = part2;
          i--;
          
          flushPage();
          continue;
        } else {
          // If we couldn't separate even minSplit children, push the whole box/list to a fresh page
          if (currentPageNodes.length > 0) {
            flushPage();
            i--;
            continue;
          }
        }
      }
    }

    let shouldBreakBefore = false;

    if (currentPageNodes.length > 0) {
      if (isChapterOpener) {
        shouldBreakBefore = true;
      } else if (isH1 && (nodeText.toLowerCase().includes('fontes consultadas') || nodeText.toLowerCase().includes('referências') || nodeText.toLowerCase().includes('referencias'))) {
        shouldBreakBefore = true;
      } else if (currentHeightUnits + nodeCost > activeLimit) {
        shouldBreakBefore = true;
      } else if (isH1 && (currentHeightUnits > activeLimit * 0.88)) {
        // Only force break on H1 if the current page is already over 88% full
        shouldBreakBefore = true;
      } else if ((isH2 || isH3 || isBox) && (currentHeightUnits > activeLimit * 0.94)) {
        // Prevent orphan headings near the very bottom of the page (last 6% height)
        shouldBreakBefore = true;
      }
    }

    if (shouldBreakBefore) {
      flushPage();
    }
    
    currentPageNodes.push(node);
    currentHeightUnits += nodeCost;
  }
  
  if (currentPageNodes.length > 0) {
    pages.push(currentPageNodes.map(n => n.outerHTML).join('\n'));
  }
  
  return pages;
}

