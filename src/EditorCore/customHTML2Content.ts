import { BlockMapBuilder, BlockMap, ContentState, genKey, Entity, CharacterMetadata, ContentBlock, convertFromHTML } from 'draft-js'
import { toArray } from 'lodash';
import DraftEntityInstance = Entity.DraftEntityInstance;
import CharacterMetadataConfig = CharacterMetadata.CharacterMetadataConfig;
import { List, OrderedSet, Repeat, fromJS } from 'Immutable'


function compose (...argument): Function {
  var args = arguments;
  var start = args.length - 1;
  return function() {
    var i = start;
    var result = args[start].apply(this, arguments);
    while (i--) result = args[i].call(this, result);
    return result;
  };
};
/*
 * Helpers
 */

// Prepares img meta data object based on img attributes
const getBlockSpecForElement = (imgElement) => ({
  contentType: 'image',
  src: imgElement.getAttribute('src'),
  width: imgElement.getAttribute('width'),
  height: imgElement.getAttribute('height'),
  float: imageElement.style.cssFloat,
})

// Wraps meta data in HTML element which is 'understandable' by Draft, I used <blockquote />.
const wrapBlockSpec = (blockSpec) => {
  if (blockSpec == null) {
    return null
  }
  const tempEl = document.createElement('blockquote')
  // stringify meta data and insert it as text content of temp HTML element. We will later extract
  // and parse it.
  tempEl.innerText = JSON.stringify(blockSpec)
  return tempEl
}
// Replaces <img> element with our temp element
const replaceElement = (oldEl, newEl) => {
  if (!(newEl instanceof HTMLElement)) {
    return
  }
  const parentNode = oldEl.parentNode
  return parentNode.replaceChild(newEl, oldEl)
}

const elementToBlockSpecElement = compose(wrapBlockSpec, getBlockSpecForElement);

const imgReplacer = (imgElement) => {
  return replaceElement(imgElement, elementToBlockSpecElement(imgElement));
}

// creates ContentBlock based on provided spec
const createContentBlock = ( blockData: DraftEntityInstance ) => {
  const {key, type, text, data, inlineStyles, entityData} = blockData;
  let blockSpec = {
    type: type != null ? type : 'unstyled',
    text: text != null ? text : '',
    key: key != null ? key : genKey(),
    data: null,
    characterList: List([]),
  };

  if (data) {
    blockSpec.data = fromJS(data)
  }

  if (inlineStyles || entityData) {
    let entityKey;
    if (entityData) {
      const {type, mutability, data} = entityData
      entityKey = Entity.create(type, mutability, data)
    } else {
      entityKey = null
    }
    const style = OrderedSet(inlineStyles || [])
    const charData = CharacterMetadata.create({style, entityKey} as CharacterMetadataConfig)
    blockSpec.characterList = List(Repeat(charData, text.length))
  }
  return new ContentBlock(blockSpec)
}

// takes HTML string and returns DraftJS ContentState
export default function customHTML2Content(HTML): BlockMap {
  let tempDoc = new DOMParser().parseFromString(HTML, 'text/html')
  // replace all <img /> with <blockquote /> elements
  toArray(tempDoc.querySelectorAll('img')).forEach(imgReplacer);
  // use DraftJS converter to do initial conversion. I don't provide DOMBuilder and
  // blockRenderMap arguments here since it should fall back to its default ones, which are fine
  let contentBlocks = convertFromHTML(tempDoc.body.innerHTML);
  // now replace <blockquote /> ContentBlocks with 'atomic' ones
  contentBlocks = contentBlocks.reduce(function (contentBlocks, block) {
    if (block.getType() !== 'blockquote') {
      return contentBlocks.concat(block)
    }
    const image = JSON.parse(block.getText())
    const entityData = Entity.create('IMAGE-ENTITY', 'IMMUTABLE', { image });
    const charData = CharacterMetadata.create({ entity: entityData });
    // const blockSpec = Object.assign({ type: 'atomic', text: ' ' }, { entityData })
    // const atomicBlock = createContentBlock(blockSpec)
    // const spacerBlock = createContentBlock({});

    const fragmentArray = [
      new ContentBlock({
        key: genKey(),
        type: 'image-block',
        text: ' ',
        characterList: List(Repeat(charData, charData.count())),
      }),
      new ContentBlock({
        key: genKey(),
        type: 'unstyled',
        text: '',
        characterList: List(),
      }),
    ];

    return contentBlocks.concat(fragmentArray);
  }, []);
  console.log('>> customHTML2Content contentBlocks', contentBlocks);
  tempDoc = null;
  return BlockMapBuilder.createFromArray(contentBlocks)
}
