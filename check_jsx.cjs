const fs = require('fs');
const content = fs.readFileSync('frontend/src/module/user/pages/cart/Cart.jsx', 'utf8');

function checkJSXBalance(code) {
    const stack = [];
    const tagRegex = /<(\/?[a-zA-Z0-9\.]+)(?:\s+[^>]*?)?(\/?)>/g;
    let match;
    let line = 1;

    // Simple line counter
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        while ((match = tagRegex.exec(l)) !== null) {
            const fullTag = match[0];
            const tagName = match[1];
            const isSelfClosing = match[2] === '/' || ['img', 'br', 'hr', 'input', 'meta', 'link'].includes(tagName.toLowerCase());
            const isClosing = tagName.startsWith('/');

            if (isSelfClosing) continue;

            if (isClosing) {
                const opened = stack.pop();
                const expected = '/' + (opened ? opened.name : 'NONE');
                if (tagName !== expected) {
                    console.log(`❌ Mismatch at line ${i + 1}: expected ${expected}, got ${tagName}`);
                    return;
                }
            } else {
                stack.push({ name: tagName, line: i + 1 });
            }
        }
    }

    if (stack.length > 0) {
        stack.forEach(s => console.log(`❌ Unclosed tag <${s.name}> at line ${s.line}`));
    } else {
        console.log('✅ JSX tags seem balanced (simpler check)');
    }
}

checkJSXBalance(content);
