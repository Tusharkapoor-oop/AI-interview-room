const fs = require('fs');
const path = require('path');
const { mdToPdf } = require('md-to-pdf');

const docsDir = path.join(__dirname, 'docs');
const outputDir = path.join(__dirname, 'docs', 'pdf_output');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

async function convertMarkdownToPDF() {
    const files = fs.readdirSync(docsDir).filter(file => file.endsWith('.md'));

    for (const file of files) {
        const mdPath = path.join(docsDir, file);
        const pdfName = file.replace('.md', '.pdf');
        const pdfPath = path.join(outputDir, pdfName);

        console.log(`Converting ${file} to PDF...`);
        try {
            const pdf = await mdToPdf({ path: mdPath }, { dest: pdfPath });
            console.log(`Successfully created: ${pdfPath}`);
        } catch (error) {
            console.error(`Error converting ${file}:`, error);
        }
    }
    console.log('\nAll documents have been successfully converted to PDF!');
}

convertMarkdownToPDF();
