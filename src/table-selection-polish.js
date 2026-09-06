/* Compatibility shim only.
   Locations, Cargo Releases, Entities and WR now own their own selection UI.
   Do not decorate those tables here: MutationObserver-based selection layers
   previously caused duplicate checkboxes and feedback-loop freezes. */
