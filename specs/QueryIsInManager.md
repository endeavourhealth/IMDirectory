# Query is in manager

## Functional Requirements

For the user to be able to create a single concept or a list of concepts  to populate the query/is , or the query/is/in class for the purposes of query

## Functional behaviour
1. To be able to set the entailment << < or -- once for the concept or list of concepts
3. On initial display if the concept is not defined the user should be able to find a concept.
4. Once one concept is defined then the user should be able to add more.
5. If there is more than one concept the user should be able to delete the additoinal concepts
6. If additoial concepts have been deleted then the user should be able to reenter the text of the first concept

## Technical requirements

The component ECLExpressionConstraint.vue is used

The ConceptSelector is used to find a concept to add.

The IMViewerLink component can be used to display the concept name for all but the concept being added.

The class to be populated is "Node" which is the property type of "Query.is"

Node has 4 main properties

Node {
   iri? : string  //This is the iri of the concept IF there is only one entry
   name? : string // This is the name of the concept IF there is only one entry
   entails? :Entail // This holds the entailment for the concepts e.g. <<, < or undefined
   in? : IriLD[]  // This holds the list of concepts if there is more than one concept in the list.


If there is more than one concept in the list the Node iri and name would be undefined. In other words the addition of a concept to the list would move all into the in list

