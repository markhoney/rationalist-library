const Papa = require('papaparse');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
//const books = require('google-books-search');
const sanitize = require("sanitize-filename");
const levenshtein = require('js-levenshtein');
async function getBooks() {
	await Papa.parse(fs.readFileSync('./Library Books - Books.tsv', "utf8"), {delimiter: "\t", header: true, complete: async function(results) {
		let index = 0;
		for(const book of results.data) {
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
			if (book.Author.includes(", ")) {
				book.Author = book.Author.split(", ").reverse().join(" ");
			} else {
				book.Author = book.Author.split(" ", 2).reverse().join(" ");
			}
			const bindingpages = book.BindingPages.split("/");
			if (bindingpages[0] == "H") {
				book.Binding = "Hardback";
			} else if (bindingpages[0] == "P") {
				book.Binding = "Paperback";
			}
			if (book.BindingPages.length > 1) {
				book.Pages = parseInt(bindingpages[1]);
			}
			if (book.Value) {
				if (book.Value.includes("US")) {
					book.Value = parseFloat(book.Value.replace("US", "").replace("$", "").trim());
					book.Currency = "USD";
				} else if (book.Value.includes("£")) {
					book.Value = parseFloat(book.Value.replace("£", "").trim());
					book.Currency = "GBP";
				} else if (book.Value.includes("AU")) {
					book.Value = parseFloat(book.Value.replace("AU", "").replace("$", "").trim());
					book.Currency = "AUD";
				} else if (book.Value.includes("A")) {
					book.Value = parseFloat(book.Value.replace("A", "").replace("$", "").trim());
					book.Currency = "AUD";
				} else {
					book.Value = parseFloat(book.Value.replace("NZ", "").replace("$", "").trim());
					book.Currency = "NZD";
				}
			}
			book.ISBN = book.ISBN.replace(/\-/g, "");
			//console.log(book);
			const cachepath = path.join(__dirname, 'cache', 'OpenLibrary', sanitize(book.Title + "|" + book.Author) + '.json');
			if (!fs.existsSync(cachepath)) {
				const results = (await axios.get('http://openlibrary.org/search.json?title=' + book.Title + '&author=' + book.Author)).docs;
				if (results) fs.writeFileSync(cachepath, JSON.stringify(results, null, '\t'));
			} else {
				const results = require(cachepath);
				results.forEach(result => {
					if (result.authors && (levenshtein(book.Author, result.authors[0]) < 5)) {
						//console.log(book.Title, levenshtein(book.Title, result.title), result.title);
						//console.log(book.Author, levenshtein(book.Author, result.authors[0]), result.authors[0]);
					}
				});
			}
		}
	}});
}

getBooks();