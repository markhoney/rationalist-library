const Papa = require('papaparse');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
//const books = require('google-books-search');
const sanitize = require("sanitize-filename");
const levenshtein = require('js-levenshtein');

async function getBooks() {
	await Papa.parse(fs.readFileSync('./Library Books - Books.tsv', "utf8"), {delimiter: "\t", header: true, complete: async function(results) {
		let total = 0;
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
			book.Author = book.Author.replace("Ackroyed", "Ackroyd");
			book.Title = book.Title.replace("Nonsence", "Nonsense");
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
			if (book.Date) book.Date = parseInt(book.Date);
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
			const cachepath = path.join(__dirname, 'cache', 'OpenLibrary', sanitize(book.Title + " - " + book.Author) + '.json');
			const cachepath2 = path.join(__dirname, 'cache', 'OpenLibrary', sanitize(book.Title) + '.json');
			let results;
			if (fs.existsSync(cachepath) || fs.existsSync(cachepath2)) {
				if (fs.existsSync(cachepath)) {
					results = require(cachepath);
				} else {
					results = require(cachepath2);
				}
			} else {
				/*try {
					const url = 'http://openlibrary.org/search.json?title=' + encodeURIComponent(book.Title) + '&author=' + encodeURIComponent(book.Author);
					results = (await axios.get(url)).data.docs;
				} catch(error) {
					//console.log(error);
				}
				if (results && results.length) {
					fs.writeFileSync(cachepath, JSON.stringify(results, null, '\t'));
				} else {
					try {
						const url = 'http://openlibrary.org/search.json?title=' + encodeURIComponent(book.Title);
						results = (await axios.get(url)).data.docs;
					} catch(error) {
						//console.log(error);
					}
					if (results && results.length) {
						fs.writeFileSync(cachepath2, JSON.stringify(results, null, '\t'));
					}
				}*/
			}
			if (results) {
				let mybook;
				let lowest = 999;
				for (let result of results) {
					if (book.ISBN && result.isbn && result.isbn.includes(book.ISBN)) {
						mybook = {spreadsheet: book, openlibrary: result};
						break;
					}
					/*if (result.publisher && result.publish_year && result.publisher.includes(book.Publisher) && result.publish_year.includes(book.Date)) {
						mybook = {spreadsheet: book, openlibrary: result};
						break;
					}*/
					const lev = Math.min(levenshtein(book.Title.split(":")[0].toLowerCase(), result.title.toLowerCase()), levenshtein(book.Title.toLowerCase(), result.title.toLowerCase())) + (result.author_name && result.author_name.length ? levenshtein(book.Author.toLowerCase(), result.author_name.join(", ").toLowerCase()) : 5);
					if (lev < lowest && lev <= 10) {
						lowest = lev;
						mybook = {spreadsheet: book, openlibrary: result};
					}
				}
				if (mybook) {
					total += 1
					//console.log(mybook.spreadsheet.Title, levenshtein(mybook.spreadsheet.Title.toLowerCase(), mybook.openlibrary.title.toLowerCase()), mybook.openlibrary.title);
					//if (mybook.openlibrary.author_name && mybook.openlibrary.author_name.length) console.log(mybook.spreadsheet.Author, levenshtein(mybook.spreadsheet.Author.toLowerCase(), mybook.openlibrary.author_name[0].toLowerCase()), mybook.openlibrary.author_name[0]);
				}
			}
		}
		console.log("Matches:", total);
	}});
}

getBooks();
