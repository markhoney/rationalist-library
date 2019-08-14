const Papa = require('papaparse');
const path = require('path');
const fs = require('fs');
const books = require('google-books-search');
const sanitize = require("sanitize-filename");

Papa.parse(fs.readFileSync('./Library Books - Books.tsv', "utf8"), {delimiter: "\t", header: true, complete: function(results) {
	let index = 0;
	results.data.forEach(book => {
		//console.log(book);
		["Author", "Title", "Description", "Keywords", "Publisher", "Date", "Status", "TimesLent", "ISBN", "Value", "BindingPages"].forEach(field => {
			book[field] = book[field].trim();
			book[field] = book[field].replace(/\s\s+/g, ' ');
			book[field] = book[field].replace(/ \: /, ": ");
		});
		["The", "A"].forEach(prefix => {
			if (book.Title.endsWith(", " + prefix)) book.Title = prefix + " " + book.Title.slice(0, - (prefix.length + 2));
			if (book.Title.endsWith(" " + prefix)) book.Title = prefix + " " + book.Title.slice(0, - (prefix.length + 1));
			if (book.Title.includes(", " + prefix + ": ")) book.Title = prefix + " " + book.Title.replace(", " + prefix + ": ", ": ");
		});
		//console.log(book.Author);
		const cachepath = path.join(__dirname, 'cache', sanitize(book.Title) + '.json');
		if (!fs.existsSync(cachepath)) {
			index++;
			setTimeout(function() {
				books.search(book.Title, function(error, results) {
					if (error) {
						console.log(error);
					} else {
						console.log(book.Title);
						fs.writeFileSync(cachepath, JSON.stringify(results, null, '\t'));
					}
				});
			}, 5000 * index, book);
		}			
	});
}});
