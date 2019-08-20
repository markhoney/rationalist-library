require('dotenv').config();
const Papa = require('papaparse');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const googlebooks = require('google-books-search');
const sanitize = require("sanitize-filename");
const levenshtein = require('js-levenshtein');
const util = require('util');

Papa.parsePromise = function(file, options) {
	return new Promise(function(complete, error) {
		Papa.parse(file, {...options, complete, error});
	});
};

googlebooks.searchPromise = util.promisify(googlebooks.search);

async function getBooks() {
	return (await Papa.parsePromise(fs.readFileSync('./Library Books - Books.tsv', "utf8"), {delimiter: "\t", header: true})).data;
}

function cleanBook(book) {
	["Author", "Title", "Description", "Keywords", "Publisher", "Date", "Status", "TimesLent", "ISBN", "Value", "BindingPages"].forEach(field => {
		book[field] = book[field].trim();
		book[field] = book[field].replace(/\s\s+/g, ' ');
		book[field] = book[field].replace(/ \: /, ": ");
	});
	["The", "A", "An"].forEach(prefix => {
		if (book.Title.endsWith(", " + prefix)) book.Title = prefix + " " + book.Title.slice(0, - (prefix.length + 2));
		if (book.Title.endsWith(" " + prefix)) book.Title = prefix + " " + book.Title.slice(0, - (prefix.length + 1));
		if (book.Title.includes(", " + prefix + ": ")) book.Title = prefix + " " + book.Title.replace(", " + prefix + ": ", ": ");
	});
	book.Author = book.Author.replace("Ackroyed", "Ackroyd");
	book.Title = book.Title.replace("Nonsence", "Nonsense");
	if (book.Author.includes(", ")) {
		//book.Author = book.Author.split(", ").reverse().join(" ");
		book.Author = book.Author.split(";").map(author => author.split(", ").reverse().join(" ")).join(", ");
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
	return book;
}

async function getOpenLibrary(book) {
	const cachepath = path.join(__dirname, 'cache', 'OpenLibrary', sanitize(book.Title + " - " + book.Author) + '.json');
	const cachepath2 = path.join(__dirname, 'cache', 'OpenLibrary', sanitize(book.Title) + '.json');
	let matches;
	if (fs.existsSync(cachepath) || fs.existsSync(cachepath2)) {
		if (fs.existsSync(cachepath)) {
			matches = require(cachepath);
		} else {
			matches = require(cachepath2);
		}
	} else {
		if (download) {
			try {
				const url = 'http://openlibrary.org/search.json?title=' + encodeURIComponent(book.Title) + '&author=' + encodeURIComponent(book.Author);
				matches = (await axios.get(url)).data.docs;
			} catch(error) {
				//console.log(error);
			}
			if (matches && matches.length) {
				fs.writeFileSync(cachepath, JSON.stringify(matches, null, '\t'));
			} else {
				try {
					const url = 'http://openlibrary.org/search.json?title=' + encodeURIComponent(book.Title);
					matches = (await axios.get(url)).data.docs;
				} catch(error) {
					//console.log(error);
				}
				if (matches && matches.length) {
					fs.writeFileSync(cachepath2, JSON.stringify(matches, null, '\t'));
				}
			}
		}
	}
	return matches;
}

async function getGoogleBooks(book) {
	const cachepath = path.join(__dirname, 'cache', 'GoogleBooks', sanitize(book.Title) + '.json');
	let matches;
	if (fs.existsSync(cachepath)) {
		matches = require(cachepath);
	} else {
		if (download) {
			try {
				matches = await googlebooks.searchPromise(encodeURIComponent(book.Title), {key: process.env.GOOGLE_API_KEY});
			} catch(error) {
				console.log(error);
			}
			if (matches && matches.length) {
				fs.writeFileSync(cachepath, JSON.stringify(matches, null, '\t'));
			}
		}
	}
	return matches;
}

async function getGoodReads(book) {

}

function matchPercent(title1, title2, authors1, authors2) {
	if (title1.includes(":") && levenshtein(title1.toLowerCase(), title2.toLowerCase()) > levenshtein(title1.split(":", 2)[0].toLowerCase(), title2.toLowerCase())) {
		title1 = title1.split(":", 2)[0];
	}
	const length = title1.length + authors1.length;
	const titlelev = levenshtein(title1.toLowerCase(), title2.toLowerCase());
	const authorlev = (authors2 && authors2.length ? levenshtein(authors1.toLowerCase(), authors2.join(", ").toLowerCase()) : authors1.length);
	const percent = (1 - ((titlelev + authorlev) / length)) * 100;
	return percent;
}

function findBestMatch(book, matches) {
	let bestmatch;
	let highest = 0;
	for (let match of matches) {
		if (book.ISBN && match.isbn && match.isbn.includes(book.ISBN)) {
			return match;
		}
		/*if (match.publisher && match.publish_year && match.publisher.includes(book.Publisher) && match.publish_year.includes(book.Date)) {
			return match;
		}*/
		const percent = matchPercent(book.Title, match.title, book.Author, match.authors);
		console.log(percent);
		if (percent > highest && percent >= lowestPercent) {
			highest = percent;
			bestmatch = match;
		}
	}
	if (bestmatch) return {...bestmatch, percent: highest};
}

function findBestOpenLibraryMatch(book, matches) {
	let bestmatch;
	let highest = 0;
	for (let match of matches) {
		if (book.ISBN && match.isbn && match.isbn.includes(book.ISBN)) {
			return match;
		}
		/*if (match.publisher && match.publish_year && match.publisher.includes(book.Publisher) && match.publish_year.includes(book.Date)) {
			return match;
		}*/
		//const lev = Math.min(levenshtein(book.Title.split(":")[0].toLowerCase(), match.title.toLowerCase()), levenshtein(book.Title.toLowerCase(), match.title.toLowerCase())) + (match.author_name && match.author_name.length ? levenshtein(book.Author.toLowerCase(), match.author_name.join(", ").toLowerCase()) : 5);
		const percent = matchPercent(book.Title, match.title, book.Author, match.author_name);
		console.log(percent);
		if (percent > highest && percent >= lowestPercent) {
			highest = percent;
			bestmatch = match;
		}
	}
	if (bestmatch) {
		bestmatch.percent = highest;
		bestmatch.authors = bestmatch.author_name;
	}
	return bestmatch;
}

function findBestGoogleBooksMatch(book, matches) {
	let bestmatch;
	let highest = 0;
	for (let match of matches) {
		if (book.ISBN && match.industryIdentifiers && match.industryIdentifiers.map(id => id.identifier).includes(book.ISBN)) {
			return match;
		}
		/*if (match.publisher && match.publish_year && match.publisher.includes(book.Publisher) && match.publish_year.includes(book.Date)) {
			return match;
		}*/
		if (match.title) {
			const percent = matchPercent(book.Title, match.title, book.Author, match.authors);
			//const lev = Math.min(levenshtein(book.Title.split(":")[0].toLowerCase(), match.title.toLowerCase()), levenshtein(book.Title.toLowerCase(), match.title.toLowerCase())) + (match.authors && match.authors.length ? levenshtein(book.Author.toLowerCase(), match.authors.join(", ").toLowerCase()) : 5);
			if (percent > highest && percent >= lowestPercent) {
				lowest = percent;
				bestmatch = match;
			}
			}
	}
	if (bestmatch) bestmatch.percent = highest;
	return bestmatch;
}

function printResult(book, match) {
	console.log(book.Title, "=>", book.Author.split(", "), match.percent);
	console.log(match.title, "=>", match.authors, match.percent);
}

const download = false;
const lowestPercent = 90;

async function all() {
	let books = await getBooks();
	let total = 0;
	for (let book of books) {
		book = cleanBook(book);
		let matches;
		let match;
		matches = await getGoogleBooks(book);
		if (matches && matches.length) {
			match = findBestMatch(book, matches.map(match => {
				return {
					...match,
					isbn: (match.industryIdentifiers ? match.industryIdentifiers.map(id => id.identifier) : []),
				};
			}));
			if (match) {
				total++;
			} else {
				matches = await getOpenLibrary(book);
				if (matches && matches.length) {
					match = findBestMatch(book, matches.map(match => {
						return {
							...match,
							authors: matches.author_name,
						};
					}));
					if (match) {
						total++;
					}
				}
			}
		}
		if (match && (match.percent < 82)) {
			//printResult(book, match);
		}
	}
	console.log(total);
}

all();
