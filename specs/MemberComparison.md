# Functional Requirements

The overall requirement is for the use to be able to see inactive concepts on the comparison screens should they wish
to.

1. For the user to be able to elect to display additional inactive concepts in the two panels
3. For the user to be able to click and view a concept from the list in the hierarchy as per the
   directory/Viewer/secondaryTree page

Note that the current member list may include inactive concepts if they were added in explicitly . Chanign the
includeInactive flag may result in adding further inactive concepts to both sides.

# Technical constraints

1. Use the MembersComparion.vue component.
2. includeInactiveNe is the constants for indicating inactive conceptsBoth

IMAPI uses tha parameter to retrieve additional linked inactive concepts. 

