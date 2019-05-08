# sparql-proxy

This middleware forwards SPARQL queries to a SPARQL endpoint.
It supports GET and POST (direct and URL-encoded) query requests and basic authentication.

## Usage

The module returns a function to build a middleware.
The function must be called with a single options object.
The following options are supported:

- `endpointUrl`: The URL of the SPARQL endpoint
- `authentication`: Credentials for basic authentication (object with `user` and `password` property)
- `queryOperation`: The query operation which will be used to access the SPARQL endpoint (default: `postQueryDirect`)

## Example

```
// load the module
var sparqlProxy = require('sparql-proxy')

// create a middleware instance and add it to the routing
app.use(sparqlProxy({
  endpointUrl: 'https://dbpedia.org/sparql'
})
```

## Debug

This package uses [`debug`](https://www.npmjs.com/package/debug), you can get debug logging via: `DEBUG=sparql-proxy`.  
Since [Trifid](https://github.com/zazuko/trifid) makes heavy use of this package, using `DEBUG=trifid:*` also enables
logging in this package.
