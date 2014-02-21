/**
 * @author Vyacheslav Slinko <vyacheslav.slinko@gmail.com>
 */

var PDFDocument = require('pdfkit');
var PDFParser = require('pdf2json/pdfparser');
var QRCode = require('qrcode');
var crypto = require('crypto');
var when = require('when');
var fs = require('fs');


function createDocumentFingerprint(path, meta) {
    var pdfParser = new PDFParser(),
        deferred = when.defer();

    pdfParser.on('pdfParser_dataReady', function(pdf) {
        var pagesFingerprints = pdf.data.Pages.map(function(page) {
            var pageHash = crypto.createHash('sha512');

            page.Texts.forEach(function(text) {
                text.R.forEach(function(run) {
                    pageHash.update(decodeURIComponent(run.T));
                });
            });

            return pageHash.digest('hex');
        });

        var documentHash = crypto.createHash('sha512');
        pagesFingerprints.forEach(documentHash.update.bind(documentHash));

        meta.fingerprint = {
            pages: pagesFingerprints,
            document: documentHash.digest('hex')
        };

        deferred.resolve(meta);
    });

    pdfParser.on('pdfParser_dataError', deferred.reject);

    pdfParser.loadPDF(path);

    return deferred.promise;
}


function createTexts(meta) {
    return meta.fingerprint.pages.map(function(pageFingerprint, index) {
        var text = [
            meta.name,
            meta.author,
            meta.email,
            'Страница ' + (index + 1) + ' из ' + meta.fingerprint.pages.length,
            ''
        ];

        text = text.concat(splitFingerprint(pageFingerprint));
        text.push('');
        text = text.concat(splitFingerprint(meta.fingerprint.document));

        return text.join('\n');
    });
}


function createQRCodes(texts) {
    return when.map(texts, function(text) {
        var deferred = when.defer(),
            hashDigest = crypto.createHash('sha512').update(text).digest('hex'),
            path = 'codes/' + hashDigest + '.png';

        QRCode.save(path, text, function(err) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(path);
            }
        });

        return deferred.promise;
    });
}


function createFingerprintFile(filePath, codeFiles) {
    var deferred = when.defer()
        pageWidth = 595,
        pageHeight = 842,
        cm = 28.3464,
        pdf = new PDFDocument({size: [pageWidth, pageHeight]});

    codeFiles.reverse().forEach(function(codeFile, index) {
        if (index !== 0) {
            pdf.addPage({size: [pageWidth, pageHeight]});
        }

        pdf.image(codeFile, 1 * cm, 2 * cm, {
            width: 5 * cm,
            height: 5 * cm
        });
    });

    pdf.write(filePath, function(err) {
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(pdf);
        }
    });

    return deferred.promise;
}


function splitFingerprint(fingerprint) {
    return fingerprint.match(/.{16}/g);
}


function main() {
    var documentPath = 'source.pdf';
    var documentMeta = {
        name: 'Договор №ПЕГАС-01/14',
        author: 'Слинько Вячеслав Дмитриевич',
        email: 'vyacheslav.slinko@gmail.com'
    };

    if (!fs.existsSync('codes')) {
        fs.mkdirSync('codes');
    }

    when(createDocumentFingerprint(documentPath, documentMeta))
        .then(createTexts)
        .then(createQRCodes)
        .then(createFingerprintFile.bind(null, 'fingerprint.pdf'))
        .then(null, function(err) {
            console.error(err);
        });
}


if (require.main === module) {
    main();
}
